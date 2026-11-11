//! The NEAR RPC reader against a local JSON-RPC server: account facts, token decimals and the
//! decimals cache.

#![expect(
    clippy::unwrap_used,
    reason = "test helpers fail loudly instead of returning errors"
)]

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use comatocard_indexer::rpc::{Chain, ChainAccount, Rpc};
use serde_json::{Value, json};

async fn rpc(
    State(calls): State<Arc<AtomicUsize>>,
    axum::Json(body): axum::Json<Value>,
) -> Response {
    calls.fetch_add(1, Ordering::Relaxed);
    let params = &body["params"];
    let account = params["account_id"].as_str().unwrap_or_default();
    match (params["request_type"].as_str(), account) {
        (_, "broken.testnet") => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        (Some("view_account"), "missing.testnet") => {
            axum::Json(json!({ "error": { "cause": { "name": "UNKNOWN_ACCOUNT" } } }))
                .into_response()
        }
        (Some("view_account"), _) => {
            axum::Json(json!({ "result": { "code_hash": "CodeV1" } })).into_response()
        }
        (Some("call_function"), _) => {
            let bytes: Vec<u8> = br#"{"spec":"ft-1.0.0","decimals":6}"#.to_vec();
            axum::Json(json!({ "result": { "result": bytes } })).into_response()
        }
        _ => StatusCode::BAD_REQUEST.into_response(),
    }
}

async fn server() -> (Rpc, Arc<AtomicUsize>) {
    let calls = Arc::new(AtomicUsize::new(0));
    let app = Router::new()
        .route("/", post(rpc))
        .with_state(calls.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await });
    (Rpc::new(reqwest::Client::new(), url), calls)
}

#[tokio::test]
async fn reads_accounts() {
    let (rpc, _) = server().await;
    assert_eq!(
        rpc.account("shop.testnet").await,
        Some(ChainAccount {
            exists: true,
            code_hash: Some("CodeV1".to_owned())
        })
    );
    assert_eq!(
        rpc.account("missing.testnet").await,
        Some(ChainAccount {
            exists: false,
            code_hash: None
        })
    );
    assert_eq!(
        rpc.account("broken.testnet").await,
        None,
        "an HTTP error is a failed lookup"
    );
}

#[tokio::test]
async fn reads_and_caches_token_decimals() {
    let (rpc, calls) = server().await;
    assert_eq!(rpc.decimals("tusd.testnet").await, Some(6));
    assert_eq!(rpc.decimals("tusd.testnet").await, Some(6));
    assert_eq!(
        calls.load(Ordering::Relaxed),
        1,
        "the second read comes from the cache"
    );
    assert_eq!(rpc.decimals("broken.testnet").await, None);
    assert_eq!(rpc.decimals("broken.testnet").await, None);
    assert_eq!(calls.load(Ordering::Relaxed), 3, "failures are not cached");
}

#[tokio::test]
async fn unreachable_rpc_is_a_failed_lookup() {
    let rpc = Rpc::new(reqwest::Client::new(), "http://127.0.0.1:9/");
    assert_eq!(rpc.account("shop.testnet").await, None);
    assert_eq!(rpc.decimals("tusd.testnet").await, None);
}
