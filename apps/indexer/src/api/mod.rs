//! REST and WebSocket API, specified in `docs/specs/indexer-api.md`.

mod format;
mod payments;
mod reports;
mod stream;
mod vaults;

use std::collections::HashMap;
use std::sync::Arc;

use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use near_sdk::AccountId;
use serde_json::json;
use sqlx::PgPool;

pub use format::{iso_from_nanos, now_nanos};

use crate::bus::EventBus;
use crate::ingest::Progress;
use crate::rpc::Chain;

/// Shared state of every route.
pub struct AppState<C> {
    pub pool: PgPool,
    pub chain: C,
    pub bus: EventBus,
    pub progress: Arc<Progress>,
    pub registry_id: Option<String>,
    /// Current time in nanoseconds; tests pin it.
    pub now: fn() -> u128,
}

/// Errors mapped to the JSON error bodies of the API.
#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    NotFound(&'static str),
    Internal(String),
}

impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        Self::Internal(error.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            Self::BadRequest(details) => (
                StatusCode::BAD_REQUEST,
                axum::Json(json!({ "error": "invalid request", "details": details })),
            )
                .into_response(),
            Self::NotFound(what) => {
                (StatusCode::NOT_FOUND, axum::Json(json!({ "error": what }))).into_response()
            }
            Self::Internal(error) => {
                tracing::error!(%error, "request failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json(json!({ "error": "internal error" })),
                )
                    .into_response()
            }
        }
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
type Shared<C> = State<Arc<AppState<C>>>;
type Params = Query<HashMap<String, String>>;

/// A NEAR account id from a path segment or query value.
fn account(value: &str, name: &str) -> ApiResult<String> {
    value
        .parse::<AccountId>()
        .map(|id| id.to_string())
        .map_err(|_| ApiError::BadRequest(format!("{name}: invalid account id")))
}

fn optional_account(params: &HashMap<String, String>, name: &str) -> ApiResult<Option<String>> {
    params.get(name).map(|v| account(v, name)).transpose()
}

fn required_account(params: &HashMap<String, String>, name: &str) -> ApiResult<String> {
    let value = params
        .get(name)
        .ok_or_else(|| ApiError::BadRequest(format!("{name}: required")))?;
    account(value, name)
}

/// A non-negative integer from a path segment or query value.
fn number(value: &str, name: &str) -> ApiResult<i64> {
    value
        .parse::<i64>()
        .ok()
        .filter(|n| *n >= 0)
        .ok_or_else(|| ApiError::BadRequest(format!("{name}: expected a non-negative integer")))
}

/// A nanosecond timestamp filter, kept as a decimal string for numeric comparison.
fn nanos(params: &HashMap<String, String>, name: &str) -> ApiResult<Option<String>> {
    params
        .get(name)
        .map(|v| {
            if !v.is_empty() && v.bytes().all(|b| b.is_ascii_digit()) {
                Ok(v.clone())
            } else {
                Err(ApiError::BadRequest(format!(
                    "{name}: expected nanoseconds"
                )))
            }
        })
        .transpose()
}

async fn health<C: Chain>(State(state): Shared<C>) -> impl IntoResponse {
    let indexed = state.progress.indexed();
    let chain = state.progress.chain();
    let lag = indexed
        .zip(chain)
        .map(|(i, c)| i64::try_from(c).unwrap_or(i64::MAX) - i64::try_from(i).unwrap_or(i64::MAX));
    axum::Json(json!({
        "status": if indexed.is_some() { "ok" } else { "starting" },
        "indexed_height": indexed,
        "chain_height": chain,
        "lag": lag,
    }))
}

async fn risk<C: Chain>(
    State(state): Shared<C>,
    Path(target): Path<String>,
    Query(params): Params,
) -> ApiResult<impl IntoResponse> {
    let target = account(&target, "account")?;
    let vault = optional_account(&params, "vault")?;
    let assessment = crate::risk::assess_account(
        &state.pool,
        &state.chain,
        state.registry_id.as_deref(),
        &target,
        vault.as_deref(),
        (state.now)(),
    )
    .await?;
    Ok(axum::Json(assessment))
}

async fn not_found() -> ApiError {
    ApiError::NotFound("not found")
}

/// Builds the router over `state`.
pub fn router<C: Chain + 'static>(state: AppState<C>) -> Router {
    Router::new()
        .route("/health", get(health::<C>))
        .route("/vaults", get(vaults::list::<C>))
        .route("/vaults/{vault}", get(vaults::summary::<C>))
        .route("/cards", get(vaults::cards_by_holder::<C>))
        .route("/vaults/{vault}/cards", get(vaults::cards::<C>))
        .route("/vaults/{vault}/cards/{card}", get(vaults::card::<C>))
        .route("/vaults/{vault}/payments", get(payments::list::<C>))
        .route("/vaults/{vault}/payments/{id}", get(payments::detail::<C>))
        .route("/vaults/{vault}/approvals", get(payments::approvals::<C>))
        .route("/vaults/{vault}/export.csv", get(reports::export_csv::<C>))
        .route("/analytics/{vault}", get(reports::analytics::<C>))
        .route("/risk/{account}", get(risk::<C>))
        .route(
            "/merchants/{merchant}/payments",
            get(payments::by_merchant::<C>),
        )
        .route("/stream", get(stream::stream::<C>))
        .fallback(not_found)
        .with_state(Arc::new(state))
}
