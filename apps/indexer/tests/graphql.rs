//! The GraphQL API at `/graphql` over the indexed scenario: it answers with the same data as the
//! REST routes, serves `GraphiQL` on GET, maps request errors and enforces its depth limit.

#![expect(
    clippy::unwrap_used,
    reason = "test helpers fail loudly instead of returning errors"
)]

mod support;

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use comatocard_indexer::api::{AppState, router};
use comatocard_indexer::bus::EventBus;
use comatocard_indexer::ingest::Progress;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use support::{FakeChain, REGISTRY, VAULT, index_scenario, timestamp_of};
use tower::ServiceExt;

fn now() -> u128 {
    timestamp_of(200).parse().unwrap()
}

async fn app() -> Router {
    let pool = support::database().await;
    index_scenario(&pool).await;
    let progress = Arc::new(Progress::default());
    progress.set(Some(108), Some(110));
    router(AppState {
        pool,
        chain: Arc::new(FakeChain::default()),
        bus: EventBus::default(),
        progress,
        registry_id: Some(REGISTRY.to_owned()),
        now,
    })
}

async fn send(app: &Router, request: Request<Body>) -> (StatusCode, String) {
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

async fn rest(app: &Router, path: &str) -> Value {
    let (status, body) = send(app, Request::get(path).body(Body::empty()).unwrap()).await;
    assert_eq!(status, StatusCode::OK, "{path}: {body}");
    serde_json::from_str(&body).unwrap()
}

async fn graphql(app: &Router, query: &str) -> Value {
    let request = Request::post("/graphql")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "query": query }).to_string()))
        .unwrap();
    let (status, body) = send(app, request).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    serde_json::from_str(&body).unwrap()
}

#[tokio::test]
async fn serves_graphiql_on_get() {
    let app = app().await;
    let (status, body) = send(&app, Request::get("/graphql").body(Body::empty()).unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.contains("graphiql@3.9.0/graphiql.min.js"), "{body}");
    assert!(body.contains("visiblePlugin: explorer"));
    assert!(body.contains(r#"vault(id: "v5.factory.comatocard.testnet")"#));
    // Every script and stylesheet from the CDN is pinned and checked.
    assert_eq!(
        body.matches("https://unpkg.com/").count(),
        body.matches("integrity=\"sha384-").count()
    );
}

#[tokio::test]
async fn answers_with_the_rest_data() {
    let app = app().await;
    let query = format!(
        r#"{{
            health {{ status indexedHeight chainHeight lag }}
            vault(id: "{VAULT}") {{ vaultId ownerId factoryId codeVersion cardCount indexedBalances {{ token available reserved }} }}
            cards(vault: "{VAULT}") {{ cardId label status policy {{ token dailyLimit merchants riskMode }} }}
            payments(vault: "{VAULT}", limit: 2) {{ items {{ id paymentId status amount }} nextCursor }}
            approvals(vault: "{VAULT}") {{ items {{ id status }} approvers {{ accountId maxAmount }} }}
        }}"#
    );
    let data = graphql(&app, &query).await["data"].clone();

    assert_eq!(
        data["health"],
        json!({ "status": "ok", "indexedHeight": 108, "chainHeight": 110, "lag": 2 })
    );

    let summary = rest(&app, &format!("/vaults/{VAULT}")).await;
    assert_eq!(data["vault"]["vaultId"], summary["vault_id"]);
    assert_eq!(data["vault"]["ownerId"], summary["owner_id"]);
    assert_eq!(data["vault"]["cardCount"], summary["card_count"]);
    assert_eq!(
        data["vault"]["indexedBalances"],
        summary["indexed_balances"]
    );

    let cards = rest(&app, &format!("/vaults/{VAULT}/cards")).await;
    let expected: Vec<Value> = cards
        .as_array()
        .unwrap()
        .iter()
        .map(|c| {
            let p = &c["policy"];
            json!({
                "cardId": c["card_id"], "label": c["label"], "status": c["status"],
                "policy": { "token": p["token"], "dailyLimit": p["daily_limit"], "merchants": p["merchants"], "riskMode": p["risk_mode"] },
            })
        })
        .collect();
    assert_eq!(data["cards"], Value::Array(expected));

    let page = rest(&app, &format!("/vaults/{VAULT}/payments?limit=2")).await;
    let ids = |items: &Value| -> Vec<Value> {
        items
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p["id"].clone())
            .collect()
    };
    assert_eq!(ids(&data["payments"]["items"]), ids(&page["items"]));
    assert_eq!(data["payments"]["nextCursor"], page["next_cursor"]);

    let approvals = rest(&app, &format!("/vaults/{VAULT}/approvals")).await;
    assert_eq!(ids(&data["approvals"]["items"]), ids(&approvals["items"]));
    let approvers: Vec<Value> = approvals["approvers"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| json!({ "accountId": a["account_id"], "maxAmount": a["max_amount"] }))
        .collect();
    assert_eq!(data["approvals"]["approvers"], Value::Array(approvers));
}

#[tokio::test]
async fn nests_vaults_cards_and_payments_like_a_subgraph() {
    let app = app().await;
    let query = format!(
        r#"{{
            vault(id: "{VAULT}") {{
                cards {{ cardId vault {{ vaultId }} payments(limit: 1) {{ items {{ cardId }} }} }}
                payments(limit: 3) {{ items {{ paymentId cardId card {{ cardId label }} vault {{ vaultId }} events {{ event blockHeight }} }} }}
                analytics {{ byCard {{ cardId token total }} rejections {{ reason count }} }}
            }}
        }}"#
    );
    let body = graphql(&app, &query).await;
    assert!(body["errors"].is_null(), "{body}");
    let vault = &body["data"]["vault"];

    for card in vault["cards"].as_array().unwrap() {
        assert_eq!(card["vault"]["vaultId"], json!(VAULT));
        for payment in card["payments"]["items"].as_array().unwrap() {
            assert_eq!(payment["cardId"], card["cardId"]);
        }
    }

    let payments = vault["payments"]["items"].as_array().unwrap();
    assert!(!payments.is_empty());
    for payment in payments {
        assert_eq!(payment["card"]["cardId"], payment["cardId"]);
        assert_eq!(payment["vault"]["vaultId"], json!(VAULT));
        let events = payment["events"].as_array().unwrap();
        if payment["paymentId"].is_null() {
            assert!(events.is_empty());
        } else {
            let id = payment["paymentId"].as_i64().unwrap();
            let detail = rest(&app, &format!("/vaults/{VAULT}/payments/{id}")).await;
            let expected: Vec<Value> = detail["events"]
                .as_array()
                .unwrap()
                .iter()
                .map(|e| json!({ "event": e["event"], "blockHeight": e["block_height"] }))
                .collect();
            assert_eq!(*events, expected);
        }
    }

    let analytics = rest(&app, &format!("/analytics/{VAULT}")).await;
    let by_card: Vec<Value> = analytics["by_card"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| json!({ "cardId": c["card_id"], "token": c["token"], "total": c["total"] }))
        .collect();
    assert_eq!(vault["analytics"]["byCard"], Value::Array(by_card));
}

#[tokio::test]
async fn types_the_risk_assessment() {
    let app = app().await;
    let body = graphql(
        &app,
        &format!(r#"{{ risk(account: "shop.testnet", vault: "{VAULT}") {{ accountId verdict reasons {{ code level }} signals {{ registryStatus reportCount sanctionsLists }} }} }}"#),
    )
    .await;
    assert!(body["errors"].is_null(), "{body}");
    let rest_risk = rest(&app, &format!("/risk/shop.testnet?vault={VAULT}")).await;
    let risk = &body["data"]["risk"];
    assert_eq!(risk["accountId"], rest_risk["account_id"]);
    assert_eq!(risk["verdict"], rest_risk["verdict"]);
    assert_eq!(
        risk["signals"]["registryStatus"],
        rest_risk["signals"]["registry_status"]
    );
    assert_eq!(
        risk["signals"]["reportCount"],
        rest_risk["signals"]["report_count"]
    );
}

#[tokio::test]
async fn maps_request_errors() {
    let app = app().await;
    let body = graphql(&app, r#"{ cards(vault: "Not An Account") { cardId } }"#).await;
    assert_eq!(
        body["errors"][0]["message"],
        json!("invalid request: vault: invalid account id")
    );
    let body = graphql(
        &app,
        r#"{ vault(id: "nobody.factory.comatocard.testnet") { vaultId } }"#,
    )
    .await;
    assert_eq!(body["errors"][0]["message"], json!("vault not found"));
}

/// The introspection query `GraphiQL` sends to load the schema (graphql-js `getIntrospectionQuery`).
const INTROSPECTION: &str = "query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } directives { name description locations args { ...InputValue } } } } fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } } fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }";

#[tokio::test]
async fn answers_the_graphiql_introspection_query() {
    let app = app().await;
    let body = graphql(&app, INTROSPECTION).await;
    assert!(body["errors"].is_null(), "{body}");
    assert_eq!(
        body["data"]["__schema"]["queryType"]["name"],
        json!("QueryRoot")
    );
}

#[tokio::test]
async fn rejects_queries_nested_too_deep() {
    let app = app().await;
    let mut deep = String::from("{ __schema { types { fields { type { ");
    deep.push_str(&"ofType { ".repeat(14));
    deep.push_str("name");
    deep.push_str(&" }".repeat(14 + 5));
    let body = graphql(&app, &deep).await;
    assert!(body["data"].is_null(), "{body}");
    assert!(
        body["errors"][0]["message"]
            .as_str()
            .unwrap()
            .contains("nested too deep"),
        "{body}"
    );
}
