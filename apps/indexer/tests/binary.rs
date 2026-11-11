//! End to end: the real binary against a mock neardata and a real Postgres. Covers start-up
//! configuration, migrations, the HTTP transport (redirected head, 429 with `Retry-After`, empty
//! heights), ingestion, the API and graceful shutdown on SIGTERM.

#![expect(
    clippy::unwrap_used,
    reason = "test helpers fail loudly instead of returning errors"
)]

mod support;

use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use serde_json::Value;
use support::{VAULT, scenario};

#[derive(Clone, Default)]
struct Neardata {
    blocks: Arc<HashMap<u64, Value>>,
    throttled_once: Arc<AtomicBool>,
    requests: Arc<Mutex<Vec<String>>>,
}

async fn head(State(n): State<Neardata>) -> Response {
    n.requests.lock().unwrap().push("head".to_owned());
    let mut headers = HeaderMap::new();
    headers.insert(header::LOCATION, "/v0/block/108".parse().unwrap());
    (StatusCode::FOUND, headers).into_response()
}

async fn block(State(n): State<Neardata>, Path(height): Path<u64>) -> Response {
    n.requests.lock().unwrap().push(height.to_string());
    if height == 103 && !n.throttled_once.swap(true, Ordering::Relaxed) {
        let mut headers = HeaderMap::new();
        headers.insert(header::RETRY_AFTER, "0".parse().unwrap());
        return (StatusCode::TOO_MANY_REQUESTS, headers).into_response();
    }
    axum::Json(n.blocks.get(&height).cloned().unwrap_or(Value::Null)).into_response()
}

struct Indexer(Child);

impl Drop for Indexer {
    fn drop(&mut self) {
        let _ = self.0.kill();
    }
}

async fn wait_for<T>(mut probe: impl AsyncFnMut() -> Option<T>) -> T {
    for _ in 0..200 {
        if let Some(value) = probe().await {
            return value;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("condition not reached in 10 s");
}

#[tokio::test]
async fn binary_indexes_serves_and_shuts_down() {
    let pool = support::database().await;
    let database_url = pool
        .connect_options()
        .get_database()
        .map(|db| format!("{}/{db}", support::server_url()));
    pool.close().await;

    let neardata = Neardata {
        blocks: Arc::new(
            scenario()
                .into_iter()
                .map(|b| (b.block.header.height, serde_json::to_value(&b).unwrap()))
                .collect(),
        ),
        ..Neardata::default()
    };
    let app = Router::new()
        .route("/v0/last_block/final", get(head))
        .route("/v0/block/{height}", get(block))
        .with_state(neardata.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mock = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await });

    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let child = Command::new(env!("CARGO_BIN_EXE_comatocard-indexer"))
        .env_clear()
        // Keep coverage instrumentation working for the child process.
        .envs(std::env::vars().filter(|(key, _)| key.starts_with("LLVM_PROFILE")))
        .env("FACTORY_ID", support::FACTORY)
        .env("REGISTRY_ID", support::REGISTRY)
        .env("DATABASE_URL", database_url.unwrap())
        .env("START_BLOCK", "100")
        .env("NEARDATA_URL", &mock)
        .env("NEARDATA_MIN_INTERVAL_MS", "0")
        .env("RPC_URL", &mock)
        .env("PORT", port.to_string())
        .env("POLL_INTERVAL_MS", "20")
        .env("LOG_LEVEL", "warn")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("start the indexer");
    let mut indexer = Indexer(child);

    let http = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{port}");
    let health: Value = wait_for(async || {
        let body: Value = http
            .get(format!("{base}/health"))
            .send()
            .await
            .ok()?
            .json()
            .await
            .ok()?;
        (body["indexed_height"] == 108).then_some(body)
    })
    .await;
    assert_eq!(health["status"], "ok");
    assert_eq!(health["chain_height"], 108);

    let vaults: Value = http
        .get(format!("{base}/vaults?owner=alice.testnet"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(vaults[0]["vault_id"], VAULT);
    let requests = neardata.requests.lock().unwrap().clone();
    assert_eq!(
        requests.iter().filter(|r| *r == "103").count(),
        2,
        "the 429 was retried"
    );
    assert!(
        requests.contains(&"102".to_owned()),
        "empty heights are requested too"
    );

    let pid = indexer.0.id().to_string();
    assert!(
        Command::new("kill")
            .args(["-TERM", &pid])
            .status()
            .unwrap()
            .success()
    );
    let status = wait_for(async || indexer.0.try_wait().ok().flatten()).await;
    assert!(
        status.success(),
        "graceful shutdown exits cleanly: {status}"
    );
}
