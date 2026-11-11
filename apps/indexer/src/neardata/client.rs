//! neardata.xyz client. Requests are paced to the free tier limit without an API key, and
//! transient failures back off exponentially; on 429 a longer `Retry-After` wins.

use std::future::Future;
use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;
use tokio::time::{Instant, sleep, sleep_until};
use tokio_util::sync::CancellationToken;

use super::Block;
use super::transport::{Response, Transport};

/// Free tier: 180 requests per minute per IP.
pub const FREE_TIER_INTERVAL: Duration = Duration::from_millis(350);
/// Longest `Retry-After` the client waits for.
pub const MAX_RETRY_AFTER: Duration = Duration::from_mins(1);

/// Where blocks come from: neardata in production, recorded blocks in tests.
pub trait BlockSource: Send + Sync {
    /// Height of the latest final block.
    fn final_height(&self) -> impl Future<Output = anyhow::Result<u64>> + Send;
    /// The final block at `height`, or `None` when no block was produced at that height.
    fn block(&self, height: u64) -> impl Future<Output = anyhow::Result<Option<Block>>> + Send;
}

impl<T: BlockSource> BlockSource for std::sync::Arc<T> {
    fn final_height(&self) -> impl Future<Output = anyhow::Result<u64>> + Send {
        T::final_height(self)
    }

    fn block(&self, height: u64) -> impl Future<Output = anyhow::Result<Option<Block>>> + Send {
        T::block(self, height)
    }
}

/// A successful response: a JSON body or a redirect target.
enum Fetched {
    Body(Value),
    Redirect(String),
}

/// The height in a `/v0/block/<height>` redirect target.
fn height_from_location(location: &str) -> Option<u64> {
    location.split('?').next()?.rsplit('/').next()?.parse().ok()
}

#[derive(Debug, Clone)]
pub struct NeardataOptions {
    pub base_url: String,
    pub api_key: Option<String>,
    /// Attempts per request for rate limits, server errors and network failures.
    pub max_attempts: u32,
    /// First retry delay; it doubles per attempt up to `max_backoff`.
    pub backoff: Duration,
    pub max_backoff: Duration,
    /// Minimum time between requests; defaults to the free tier interval without an API key.
    pub min_interval: Option<Duration>,
}

impl NeardataOptions {
    pub fn new(base_url: impl Into<String>, api_key: Option<String>) -> Self {
        Self {
            base_url: base_url.into(),
            api_key,
            max_attempts: 8,
            backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(30),
            min_interval: None,
        }
    }
}

/// Parses `Retry-After` given in seconds; HTTP dates are treated as absent.
pub fn retry_after(header: Option<&str>) -> Option<Duration> {
    let value = header?.trim();
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let seconds: u64 = value.parse().ok()?;
    Some(Duration::from_secs(seconds).min(MAX_RETRY_AFTER))
}

pub struct Neardata<T = reqwest::Client> {
    transport: T,
    options: NeardataOptions,
    min_interval: Duration,
    next_slot: Mutex<Option<Instant>>,
    shutdown: CancellationToken,
}

impl<T: Transport> Neardata<T> {
    pub fn new(transport: T, options: NeardataOptions, shutdown: CancellationToken) -> Self {
        let min_interval = options
            .min_interval
            .unwrap_or(if options.api_key.is_some() {
                Duration::ZERO
            } else {
                FREE_TIER_INTERVAL
            });
        Self {
            transport,
            options,
            min_interval,
            next_slot: Mutex::new(None),
            shutdown,
        }
    }

    /// Reserves the next request slot, so concurrent callers are paced too.
    fn reserve_slot(&self) -> Instant {
        let mut next = self
            .next_slot
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let start = next.map_or_else(Instant::now, |slot| slot.max(Instant::now()));
        *next = Some(start + self.min_interval);
        start
    }

    /// Waits `duration` unless shutdown starts first.
    async fn pause(&self, duration: Duration) {
        tokio::select! {
            () = sleep(duration) => {}
            () = self.shutdown.cancelled() => {}
        }
    }

    async fn get(&self, path: &str) -> anyhow::Result<Fetched> {
        let mut url = format!("{}{path}", self.options.base_url.trim_end_matches('/'));
        if let Some(key) = &self.options.api_key {
            url.push_str("?apiKey=");
            url.push_str(key);
        }
        let mut last_error = String::new();
        for attempt in 1..=self.options.max_attempts {
            anyhow::ensure!(!self.shutdown.is_cancelled(), "{path}: aborted");
            let exponent = attempt.saturating_sub(1).min(16);
            let mut delay =
                (self.options.backoff * 2u32.pow(exponent)).min(self.options.max_backoff);
            let start = self.reserve_slot();
            tokio::select! {
                () = sleep_until(start) => {}
                () = self.shutdown.cancelled() => anyhow::bail!("{path}: aborted"),
            }
            match self.transport.get(&url).await {
                Ok(response) if (200..300).contains(&response.status) => {
                    return response
                        .body
                        .map(Fetched::Body)
                        .map_err(|error| anyhow::anyhow!("{path}: {error}"));
                }
                Ok(Response {
                    status: 300..=399,
                    location: Some(location),
                    ..
                }) => return Ok(Fetched::Redirect(location)),
                Ok(response) => {
                    last_error = format!("{path} responded {}", response.status);
                    let retryable = response.status == 429 || response.status >= 500;
                    anyhow::ensure!(retryable, "{last_error}");
                    if response.status == 429 {
                        // Cloudflare in front of neardata sends `Retry-After: 0` while the limit
                        // is still active, so the header only raises the backoff.
                        delay = delay
                            .max(retry_after(response.retry_after.as_deref()).unwrap_or_default());
                    }
                }
                Err(error) => last_error = format!("{path}: {error}"),
            }
            if attempt < self.options.max_attempts {
                tracing::warn!(path, attempt, delay_ms = delay.as_millis(), reason = %last_error, "neardata request retried");
                self.pause(delay).await;
            }
        }
        anyhow::bail!("{last_error} after {} attempts", self.options.max_attempts)
    }
}

impl<T: Transport> BlockSource for Neardata<T> {
    async fn final_height(&self) -> anyhow::Result<u64> {
        match self.get("/v0/last_block/final").await? {
            Fetched::Redirect(location) => height_from_location(&location)
                .ok_or_else(|| anyhow::anyhow!("unexpected redirect to {location}")),
            Fetched::Body(body) => Ok(serde_json::from_value::<Block>(body)?.block.header.height),
        }
    }

    async fn block(&self, height: u64) -> anyhow::Result<Option<Block>> {
        let Fetched::Body(body) = self.get(&format!("/v0/block/{height}")).await? else {
            anyhow::bail!("/v0/block/{height}: unexpected redirect");
        };
        if body.is_null() {
            return Ok(None);
        }
        Ok(Some(serde_json::from_value(body)?))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::Arc;

    use super::*;

    /// Scripted responses; records when each request started on the paused clock.
    #[derive(Clone, Default)]
    struct Script {
        responses: Arc<Mutex<VecDeque<Response>>>,
        starts: Arc<Mutex<Vec<Instant>>>,
        urls: Arc<Mutex<Vec<String>>>,
    }

    impl Script {
        fn push(&self, status: u16, retry_after: Option<&str>) {
            let body = serde_json::json!({
                "block": { "header": { "height": 7, "timestamp_nanosec": "1", "hash": "h" } },
                "shards": [],
            });
            self.responses.lock().unwrap().push_back(Response {
                status,
                retry_after: retry_after.map(str::to_owned),
                location: None,
                body: Ok(body),
            });
        }
    }

    impl Transport for Script {
        async fn get(&self, url: &str) -> Result<Response, String> {
            self.starts.lock().unwrap().push(Instant::now());
            self.urls.lock().unwrap().push(url.to_owned());
            self.responses
                .lock()
                .unwrap()
                .pop_front()
                .ok_or_else(|| "connection refused".to_owned())
        }
    }

    fn client(script: &Script, api_key: Option<&str>) -> Neardata<Script> {
        Neardata::new(
            script.clone(),
            NeardataOptions::new("https://n.example", api_key.map(str::to_owned)),
            CancellationToken::new(),
        )
    }

    #[tokio::test(start_paused = true)]
    async fn reads_the_head_height_from_the_redirect() {
        let script = Script::default();
        script.responses.lock().unwrap().push_back(Response {
            status: 302,
            retry_after: None,
            location: Some("/v0/block/277186697".to_owned()),
            body: Ok(Value::Null),
        });
        assert_eq!(
            client(&script, Some("k")).final_height().await.unwrap(),
            277_186_697
        );
        assert_eq!(
            script.starts.lock().unwrap().len(),
            1,
            "one request per head check"
        );
        assert_eq!(
            height_from_location("https://x/v0/block/12?apiKey=k"),
            Some(12)
        );
        assert_eq!(height_from_location("/v0/block/latest"), None);
    }

    #[test]
    fn parses_retry_after_seconds_only() {
        assert_eq!(retry_after(Some("3")), Some(Duration::from_secs(3)));
        assert_eq!(retry_after(Some("999")), Some(MAX_RETRY_AFTER));
        assert_eq!(retry_after(Some("Wed, 21 Oct 2026 07:28:00 GMT")), None);
        assert_eq!(retry_after(None), None);
    }

    #[tokio::test(start_paused = true)]
    async fn issue_25_paces_requests_below_the_free_tier() {
        let script = Script::default();
        for _ in 0..3 {
            script.push(200, None);
        }
        let source = client(&script, None);
        for height in 1..=3 {
            source.block(height).await.unwrap();
        }
        let starts = script.starts.lock().unwrap().clone();
        for pair in starts.windows(2) {
            assert!(pair[1] - pair[0] >= FREE_TIER_INTERVAL);
        }
    }

    #[tokio::test(start_paused = true)]
    async fn issue_25_retries_429_with_retry_after_as_a_floor() {
        let script = Script::default();
        script.push(429, Some("0"));
        script.push(429, Some("5"));
        script.push(200, None);
        let source = client(&script, Some("key"));
        let started = Instant::now();
        assert_eq!(source.final_height().await.unwrap(), 7);
        let starts = script.starts.lock().unwrap().clone();
        assert_eq!(starts.len(), 3);
        // `Retry-After: 0` does not shorten the 1 s backoff; 5 s beats the 2 s backoff.
        assert!(starts[1] - started >= Duration::from_secs(1));
        assert!(starts[2] - starts[1] >= Duration::from_secs(5));
        assert!(script.urls.lock().unwrap()[0].ends_with("/v0/last_block/final?apiKey=key"));
    }

    #[tokio::test(start_paused = true)]
    async fn gives_up_on_client_errors_and_after_the_last_attempt() {
        let script = Script::default();
        script.push(404, None);
        assert!(client(&script, Some("k")).block(1).await.is_err());
        let failing = client(&Script::default(), Some("k"));
        let error = failing.block(1).await.unwrap_err().to_string();
        assert!(error.contains("after 8 attempts"), "{error}");
    }

    #[tokio::test(start_paused = true)]
    async fn shutdown_interrupts_a_backoff() {
        let script = Script::default();
        let token = CancellationToken::new();
        let source = Neardata::new(
            script,
            NeardataOptions::new("https://n.example", Some("k".to_owned())),
            token.clone(),
        );
        token.cancel();
        assert!(source.block(1).await.is_err());
    }
}
