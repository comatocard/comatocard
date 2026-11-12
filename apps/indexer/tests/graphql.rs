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
    assert!(body.contains("graphiql"), "{body}");
    assert!(body.contains("Comatocard indexer"));
}

#[tokio::test]
async fn answers_with_the_rest_data() {
    let app = app().await;
    let query = format!(
        r#"{{
            health
            vault(id: "{VAULT}")
            cards(vault: "{VAULT}") {{ cardId label status policy }}
            payments(vault: "{VAULT}", limit: 2) {{ items {{ id paymentId status amount }} nextCursor }}
            approvals(vault: "{VAULT}")
        }}"#
    );
    let data = graphql(&app, &query).await["data"].clone();

    assert_eq!(data["health"]["lag"], json!(2));
    let mut summary = rest(&app, &format!("/vaults/{VAULT}")).await;
    let mut gql_summary = data["vault"].clone();
    summary["spent_today"] = json!(null);
    gql_summary["spent_today"] = json!(null);
    assert_eq!(gql_summary, summary);

    let cards = rest(&app, &format!("/vaults/{VAULT}/cards")).await;
    let expected: Vec<Value> = cards
        .as_array()
        .unwrap()
        .iter()
        .map(|c| json!({ "cardId": c["card_id"], "label": c["label"], "status": c["status"], "policy": c["policy"] }))
        .collect();
    assert_eq!(data["cards"], Value::Array(expected));

    let page = rest(&app, &format!("/vaults/{VAULT}/payments?limit=2")).await;
    let ids: Vec<Value> = page["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["id"].clone())
        .collect();
    let gql_ids: Vec<Value> = data["payments"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["id"].clone())
        .collect();
    assert_eq!(gql_ids, ids);
    assert_eq!(data["payments"]["nextCursor"], page["next_cursor"]);
    assert_eq!(
        data["approvals"],
        rest(&app, &format!("/vaults/{VAULT}/approvals")).await
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
        r#"{ vault(id: "nobody.factory.comatocard.testnet") }"#,
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
