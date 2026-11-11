//! HTTP transport of the neardata client: reqwest in production, scripted responses in tests.

use std::future::Future;

use serde_json::Value;

/// One HTTP response as the client needs it.
#[derive(Debug)]
pub struct Response {
    pub status: u16,
    pub retry_after: Option<String>,
    /// Target of a redirect. `last_block/final` redirects to `/v0/block/<height>`, so the head
    /// height is read from here without a second request.
    pub location: Option<String>,
    pub body: Result<Value, String>,
}

/// Performs GET requests; reqwest in production, scripted responses in tests.
pub trait Transport: Send + Sync {
    fn get(&self, url: &str) -> impl Future<Output = Result<Response, String>> + Send;
}

impl Transport for reqwest::Client {
    async fn get(&self, url: &str) -> Result<Response, String> {
        let response = self
            .get(url)
            .header("accept", "application/json")
            .send()
            .await
            .map_err(|error| error.to_string())?;
        let status = response.status().as_u16();
        let header = |name: &str| {
            response
                .headers()
                .get(name)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned)
        };
        let retry_after = header("retry-after");
        let location = header("location");
        let body = if response.status().is_redirection() {
            Ok(Value::Null)
        } else {
            response.json().await.map_err(|error| error.to_string())
        };
        Ok(Response {
            status,
            retry_after,
            location,
            body,
        })
    }
}
