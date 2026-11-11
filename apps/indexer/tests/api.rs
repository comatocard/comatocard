//! The HTTP and WebSocket API over the indexed scenario. The JSON and CSV snapshots in
//! `tests/snapshots` were recorded by the TypeScript indexer, so passing them proves the rewrite
//! kept the API that agents and the web app consume.

mod support;

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use comatocard_indexer::api::{AppState, router};
use comatocard_indexer::bus::{EventBus, StreamEvent};
use comatocard_indexer::ingest::Progress;
use futures_util::StreamExt;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use support::{FakeChain, REGISTRY, VAULT, index_scenario, timestamp_of};
use tower::ServiceExt;

fn now() -> u128 {
    timestamp_of(200).parse().unwrap()
}

struct Api {
    app: Router,
    chain: Arc<FakeChain>,
}

fn api_with(pool: PgPool, bus: EventBus) -> Api {
    let progress = Arc::new(Progress::default());
    progress.set(Some(108), Some(110));
    let chain = Arc::new(FakeChain::default());
    let app = router(AppState {
        pool,
        chain: chain.clone(),
        bus,
        progress,
        registry_id: Some(REGISTRY.to_owned()),
        now,
    });
    Api { app, chain }
}

async fn api() -> Api {
    let pool = support::database().await;
    index_scenario(&pool).await;
    api_with(pool, EventBus::default())
}

impl Api {
    async fn raw(&self, path: &str) -> (StatusCode, String, String) {
        let response = self
            .app
            .clone()
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let content_type = response
            .headers()
            .get("content-type")
            .map(|v| v.to_str().unwrap().to_owned())
            .unwrap_or_default();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            content_type,
            String::from_utf8(bytes.to_vec()).unwrap(),
        )
    }

    async fn get(&self, path: &str) -> (StatusCode, Value) {
        let (status, _, body) = self.raw(path).await;
        (status, serde_json::from_str(&body).unwrap_or(Value::Null))
    }

    async fn ok(&self, path: &str) -> Value {
        let (status, body) = self.get(path).await;
        assert_eq!(status, StatusCode::OK, "{path}: {body}");
        body
    }
}

fn snapshot(name: &str) -> String {
    std::fs::read_to_string(format!(
        "{}/tests/snapshots/{name}",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}

fn json_snapshot(name: &str) -> Value {
    serde_json::from_str(&snapshot(name)).unwrap()
}

#[tokio::test]
async fn reports_health_and_lag() {
    let api = api().await;
    assert_eq!(
        api.ok("/health").await,
        json!({ "status": "ok", "indexed_height": 108, "chain_height": 110, "lag": 2 })
    );
}

#[tokio::test]
async fn lists_vaults_by_owner_and_summarizes_a_vault() {
    let api = api().await;
    assert_eq!(
        api.ok("/vaults?owner=alice.testnet").await,
        json_snapshot("vaults_by_owner.json")
    );
    let mut summary = api.ok(&format!("/vaults/{VAULT}")).await;
    summary["spent_today"] = json!("<time dependent>");
    assert_eq!(summary, json_snapshot("vault_summary.json"));
    assert_eq!(
        api.get("/vaults/nobody.factory.comatocard.testnet").await.0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn serves_cards_and_one_card_with_its_recent_payments() {
    let api = api().await;
    assert_eq!(
        api.ok(&format!("/vaults/{VAULT}/cards")).await,
        json_snapshot("cards.json")
    );
    let card = api.ok(&format!("/vaults/{VAULT}/cards/0")).await;
    assert_eq!(card["recent_payments"].as_array().unwrap().len(), 4);
    assert_eq!(
        api.get(&format!("/vaults/{VAULT}/cards/9")).await.0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn finds_cards_by_token_holder() {
    let api = api().await;
    let held = api.ok("/cards?holder=alice.testnet").await;
    assert_eq!(held[0]["card_id"], 0);
    assert_eq!(api.ok("/cards?holder=agent.testnet").await, json!([]));
    assert_eq!(api.get("/cards").await.0, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn filters_and_paginates_payments() {
    let api = api().await;
    assert_eq!(
        api.ok(&format!("/vaults/{VAULT}/payments")).await,
        json_snapshot("payments.json")
    );
    let rejected = api
        .ok(&format!("/vaults/{VAULT}/payments?status=rejected"))
        .await;
    assert_eq!(rejected["items"][0]["reason"], "per_tx_limit");
    let first = api.ok(&format!("/vaults/{VAULT}/payments?limit=3")).await;
    assert_eq!(first["items"].as_array().unwrap().len(), 3);
    let cursor = first["next_cursor"].as_str().unwrap();
    let next = api
        .ok(&format!("/vaults/{VAULT}/payments?limit=3&cursor={cursor}"))
        .await;
    assert_eq!(next["next_cursor"], Value::Null);
    assert_eq!(next["items"].as_array().unwrap().len(), 1);
    let travel = api
        .ok(&format!("/vaults/{VAULT}/payments?merchant=travel.testnet"))
        .await;
    assert_eq!(travel["items"].as_array().unwrap().len(), 1);
    let range = api
        .ok(&format!(
            "/vaults/{VAULT}/payments?from={}&to={}&card=0",
            timestamp_of(104),
            timestamp_of(105)
        ))
        .await;
    assert_eq!(range["items"].as_array().unwrap().len(), 2);
    for bad in [
        "cursor=bogus",
        "status=lost",
        "limit=0",
        "limit=101",
        "from=yesterday",
        "card=-1",
    ] {
        let path = format!("/vaults/{VAULT}/payments?{bad}");
        assert_eq!(api.get(&path).await.0, StatusCode::BAD_REQUEST, "{path}");
    }
}

#[tokio::test]
async fn returns_a_payment_with_its_event_history() {
    let api = api().await;
    let payment = api.ok(&format!("/vaults/{VAULT}/payments/1")).await;
    let names: Vec<&str> = payment["events"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["event"].as_str().unwrap())
        .collect();
    assert_eq!(
        names,
        ["payment_queued", "payment_approved", "payment_settled"]
    );
    assert_eq!(
        api.get(&format!("/vaults/{VAULT}/payments/99")).await.0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn lists_approvals_and_approvers() {
    let api = api().await;
    assert_eq!(
        api.ok(&format!("/vaults/{VAULT}/approvals")).await,
        json!({ "items": [], "approvers": [{ "account_id": "council.testnet", "max_amount": "80000000" }] })
    );
}

#[tokio::test]
async fn exports_an_accountant_friendly_csv() {
    let api = api().await;
    let (status, content_type, body) = api.raw(&format!("/vaults/{VAULT}/export.csv")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(content_type, "text/csv; charset=utf-8");
    assert_eq!(body, snapshot("export.csv"));
}

/// Regression for #54: the TypeScript indexer answered 500 here and its snapshot recorded it.
#[tokio::test]
async fn issue_54_aggregates_analytics() {
    let api = api().await;
    let token = "tusd.comatocard.testnet";
    assert_eq!(
        api.ok(&format!("/analytics/{VAULT}")).await,
        json!({
            "by_card": [{ "card_id": 0, "token": token, "total": "100000000" }],
            "by_merchant": [
                { "merchant": "shop.testnet", "token": token, "total": "40000000" },
                { "merchant": "travel.testnet", "token": token, "total": "60000000" },
            ],
            "by_day": [{ "date": "2026-11-06", "token": token, "total": "100000000" }],
            "rejections": [{ "reason": "per_tx_limit", "count": 1 }],
        })
    );
    let empty = api
        .ok(&format!("/analytics/{VAULT}?from={}", timestamp_of(300)))
        .await;
    assert_eq!(empty["by_card"], json!([]));
}

#[tokio::test]
async fn finds_merchant_payments_by_reference() {
    let api = api().await;
    let found = api
        .ok("/merchants/shop.testnet/payments?reference=inv-1")
        .await;
    let statuses: Vec<&str> = found
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["status"].as_str().unwrap())
        .collect();
    assert_eq!(statuses, ["settled"]);
    assert_eq!(
        api.ok("/merchants/shop.testnet/payments")
            .await
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let long = "x".repeat(65);
    for bad in [
        format!("/merchants/shop.testnet/payments?reference={long}"),
        "/merchants/shop.testnet/payments?reference=".to_owned(),
    ] {
        assert_eq!(api.get(&bad).await.0, StatusCode::BAD_REQUEST, "{bad}");
    }
}

#[tokio::test]
async fn assesses_counterparty_risk() {
    let api = api().await;
    assert_eq!(
        api.ok(&format!("/risk/scam.testnet?vault={VAULT}")).await,
        json_snapshot("risk_scam.json")
    );
    assert_eq!(
        api.ok(&format!("/risk/shop.testnet?vault={VAULT}")).await["verdict"],
        "allow"
    );
    assert_eq!(api.ok("/risk/missing.testnet").await["verdict"], "warn");
}

#[tokio::test]
async fn warns_when_a_contract_code_changes_after_it_was_first_observed() {
    let api = api().await;
    *api.chain.code_hash.lock().unwrap() = Some("CodeV1".to_owned());
    assert_eq!(api.ok("/risk/shop.testnet").await["verdict"], "allow");
    *api.chain.code_hash.lock().unwrap() = Some("CodeV2".to_owned());
    let changed = api.ok("/risk/shop.testnet").await;
    assert_eq!(changed["verdict"], "warn");
    assert!(
        changed["reasons"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["code"] == "code_changed_recently")
    );
}

#[tokio::test]
async fn rejects_invalid_input_and_unknown_routes() {
    let api = api().await;
    let (status, body) = api.get("/vaults").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error"], "invalid request");
    assert_eq!(
        api.get("/risk/NOT%20VALID").await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        api.get("/nope").await,
        (StatusCode::NOT_FOUND, json!({ "error": "not found" }))
    );
}

#[tokio::test]
async fn streams_matching_events_to_subscribers() {
    let bus = EventBus::default();
    let api = api_with(support::database().await, bus.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = tokio::spawn(async move { axum::serve(listener, api.app).await });
    let (mut socket, _) =
        tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}/stream?vault={VAULT}"))
            .await
            .unwrap();
    // The subscription exists once the upgrade completed; give the handler a moment to run.
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    let event = |contract: &str, id: u64| StreamEvent {
        contract_id: contract.to_owned(),
        event: "payment_expired".to_owned(),
        data: json!({ "payment_id": id }),
        block_height: 1,
        tx_hash: None,
        timestamp: "1".to_owned(),
    };
    bus.publish(event("other.testnet", 9));
    bus.publish(event(VAULT, 4));
    let message = tokio::time::timeout(std::time::Duration::from_secs(5), socket.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let received: Value = serde_json::from_str(message.to_text().unwrap()).unwrap();
    assert_eq!(received["contract_id"], VAULT);
    assert_eq!(received["data"], json!({ "payment_id": 4 }));
    server.abort();
}

#[tokio::test]
async fn database_failures_answer_500_without_details() {
    let pool = support::database().await;
    index_scenario(&pool).await;
    sqlx::query("drop table payments")
        .execute(&pool)
        .await
        .unwrap();
    let api = api_with(pool, EventBus::default());
    assert_eq!(
        api.get(&format!("/vaults/{VAULT}/payments")).await,
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({ "error": "internal error" })
        )
    );
}

#[tokio::test]
async fn summary_counts_withdrawals_reservations_and_every_token() {
    let pool = support::database().await;
    index_scenario(&pool).await;
    let block = support::make_block(
        200,
        &[support::outcome(
            VAULT,
            vec![
                support::event_line(
                    "withdrawal",
                    json!({ "token": support::TOKEN, "receiver_id": "alice.testnet", "amount": "50000000", "success": true }),
                ),
                support::event_line(
                    "deposit",
                    json!({ "token": "usdc.testnet", "sender_id": "alice.testnet", "amount": "7" }),
                ),
                support::event_line(
                    "payment_queued",
                    json!({ "payment_id": 5, "card_id": 0, "merchant": "travel.testnet", "token": support::TOKEN, "amount": "60000000", "memo": null, "reference": null, "cause": "threshold" }),
                ),
            ],
        )],
    );
    comatocard_indexer::ingest::index_block(&pool, &support::tracked(), 200, Some(&block))
        .await
        .unwrap();
    let api = api_with(pool, EventBus::default());
    let summary = api.ok(&format!("/vaults/{VAULT}")).await;
    assert_eq!(
        summary["indexed_balances"],
        json!([
            { "token": support::TOKEN, "available": "290000000", "reserved": "60000000" },
            { "token": "usdc.testnet", "available": "7", "reserved": "0" },
        ])
    );
}

#[tokio::test]
async fn issue_71_a_sanctions_report_blocks_and_names_the_list() {
    let pool = support::database().await;
    index_scenario(&pool).await;
    let block = support::make_block(
        200,
        &[support::outcome(
            REGISTRY,
            vec![support::event_line(
                "report_submitted",
                json!({ "report_id": 1, "account_id": "listed.testnet", "reporter_id": "curator.testnet", "category": "sanctions", "evidence_uri": "sanctions:OFAC-SDN:2026-03-21:SDN-1" }),
            )],
        )],
    );
    comatocard_indexer::ingest::index_block(&pool, &support::tracked(), 200, Some(&block))
        .await
        .unwrap();
    let api = api_with(pool, EventBus::default());
    let verdict = api.ok("/risk/listed.testnet").await;
    assert_eq!(verdict["verdict"], "block");
    assert_eq!(verdict["reasons"][0]["code"], "sanctions_listed");
    assert_eq!(
        verdict["signals"]["sanctions_lists"],
        json!(["OFAC-SDN (2026-03-21)"])
    );
}

#[tokio::test]
async fn issue_72_values_the_export_at_an_operator_rate() {
    let api = api().await;
    let path = format!(
        "/vaults/{VAULT}/export.csv?fiat=IDR&rate=16250.5&rate_source=BI-JISDOR&rate_at=2026-11-06"
    );
    let (status, _, body) = api.raw(&path).await;
    assert_eq!(status, StatusCode::OK);
    let mut lines = body.lines();
    assert!(
        lines
            .next()
            .unwrap()
            .ends_with(",fiat_currency,fiat_amount,fiat_rate,rate_source,rate_at")
    );
    assert!(
        lines
            .next()
            .unwrap()
            .ends_with(",IDR,650020.00,16250.5,BI-JISDOR,2026-11-06"),
        "40 tUSD at 16,250.5"
    );
    for bad in [
        "fiat=IDR",
        "fiat=idr&rate=1&rate_source=x&rate_at=y",
        "fiat=IDR&rate=0&rate_source=x&rate_at=y",
        "fiat=IDR&rate=abc&rate_source=x&rate_at=y",
    ] {
        assert_eq!(
            api.raw(&format!("/vaults/{VAULT}/export.csv?{bad}"))
                .await
                .0,
            StatusCode::BAD_REQUEST,
            "{bad}"
        );
    }
}
