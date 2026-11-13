//! Payment history, approvals and the merchant lookup used by the HTTP 402 flow.

use axum::Json;
use axum::extract::{Path, Query, State};
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::{Postgres, QueryBuilder};

use super::{
    ApiError, ApiResult, Params, Shared, account, format, nanos, number, optional_account,
};
use crate::rpc::Chain;

const STATUSES: [&str; 8] = [
    "submitted",
    "queued",
    "approved",
    "declined",
    "expired",
    "settled",
    "failed",
    "rejected",
];
const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 100;

#[derive(Debug, Serialize, serde::Deserialize, sqlx::FromRow, async_graphql::SimpleObject)]
#[graphql(complex)]
#[expect(
    clippy::struct_field_names,
    reason = "field names are the API response keys"
)]
pub struct Payment {
    pub id: i64,
    pub payment_id: Option<i64>,
    pub vault_id: String,
    pub card_id: i32,
    pub merchant: String,
    pub token: String,
    pub amount: String,
    pub memo: Option<String>,
    pub reference: Option<String>,
    pub status: String,
    pub queue_cause: Option<String>,
    pub reason: Option<String>,
    pub approver_id: Option<String>,
    pub tx_hash: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Columns of [`Payment`], as a literal so queries stay compile-time SQL.
macro_rules! payment_columns {
    () => {
        "id, payment_id, vault_id, card_id, merchant, token, amount::text as amount, memo, reference, status, \
         queue_cause, reason, approver_id, tx_hash, created_at::text as created_at, updated_at::text as updated_at"
    };
}
pub(crate) use payment_columns;

pub async fn list<C: Chain>(
    State(state): Shared<C>,
    Path(vault): Path<String>,
    Query(params): Params,
) -> ApiResult<Json<Value>> {
    let vault_id = account(&vault, "vault")?;
    let card = params.get("card").map(|v| number(v, "card")).transpose()?;
    let status = params.get("status").cloned();
    if let Some(status) = &status
        && !STATUSES.contains(&status.as_str())
    {
        return Err(ApiError::BadRequest(format!(
            "status: unknown status {status}"
        )));
    }
    let merchant = optional_account(&params, "merchant")?;
    let from = nanos(&params, "from")?;
    let to = nanos(&params, "to")?;
    let before = match params.get("cursor") {
        Some(cursor) => Some(
            format::decode_cursor(cursor)
                .ok_or(ApiError::BadRequest("invalid cursor".to_owned()))?,
        ),
        None => None,
    };
    let limit = match params.get("limit") {
        Some(value) => number(value, "limit")?,
        None => DEFAULT_LIMIT,
    };
    if !(1..=MAX_LIMIT).contains(&limit) {
        return Err(ApiError::BadRequest("limit: expected 1 to 100".to_owned()));
    }

    let mut query = QueryBuilder::<Postgres>::new(concat!(
        "select ",
        payment_columns!(),
        " from payments where vault_id = "
    ));
    query.push_bind(vault_id);
    if let Some(card) = card {
        query.push(" and card_id = ").push_bind(card);
    }
    if let Some(status) = status {
        query.push(" and status = ").push_bind(status);
    }
    if let Some(merchant) = merchant {
        query.push(" and merchant = ").push_bind(merchant);
    }
    if let Some(from) = from {
        query
            .push(" and created_at >= ")
            .push_bind(from)
            .push("::numeric");
    }
    if let Some(to) = to {
        query
            .push(" and created_at <= ")
            .push_bind(to)
            .push("::numeric");
    }
    if let Some(before) = before {
        query.push(" and id < ").push_bind(before);
    }
    query.push(" order by id desc limit ").push_bind(limit + 1);
    let mut rows: Vec<Payment> = query.build_query_as().fetch_all(&state.pool).await?;
    let more = i64::try_from(rows.len()).unwrap_or(i64::MAX) > limit;
    rows.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
    let next_cursor = rows
        .last()
        .filter(|_| more)
        .map(|last| format::encode_cursor(last.id));
    Ok(Json(json!({ "items": rows, "next_cursor": next_cursor })))
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct HistoryEvent {
    event: String,
    data: Value,
    block_height: i64,
    tx_hash: Option<String>,
    timestamp: String,
}

pub async fn detail<C: Chain>(
    State(state): Shared<C>,
    Path((vault, id)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let vault_id = account(&vault, "vault")?;
    let payment_id = number(&id, "id")?;
    let row: Payment = sqlx::query_as(concat!(
        "select ",
        payment_columns!(),
        " from payments where vault_id = $1 and payment_id = $2"
    ))
    .bind(&vault_id)
    .bind(payment_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("payment not found"))?;
    let history: Vec<HistoryEvent> = sqlx::query_as(
        "select event, data, block_height, tx_hash, block_timestamp::text as timestamp from events \
         where contract_id = $1 and data->>'payment_id' = $2 order by block_height, log_index",
    )
    .bind(&vault_id)
    .bind(payment_id.to_string())
    .fetch_all(&state.pool)
    .await?;
    let mut body = serde_json::to_value(row).map_err(|e| ApiError::Internal(e.to_string()))?;
    body["events"] =
        serde_json::to_value(history).map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(body))
}

pub async fn approvals<C: Chain>(
    State(state): Shared<C>,
    Path(vault): Path<String>,
) -> ApiResult<Json<Value>> {
    let vault_id = account(&vault, "vault")?;
    let items: Vec<Payment> = sqlx::query_as(concat!(
        "select ",
        payment_columns!(),
        " from payments where vault_id = $1 and status = 'queued' order by id"
    ))
    .bind(&vault_id)
    .fetch_all(&state.pool)
    .await?;
    let approvers: Vec<(String, String)> = sqlx::query_as(
        "select account_id, max_amount::text from approvers where vault_id = $1 order by account_id",
    )
    .bind(&vault_id)
    .fetch_all(&state.pool)
    .await?;
    let approvers: Vec<Value> = approvers
        .into_iter()
        .map(|(account_id, max_amount)| json!({ "account_id": account_id, "max_amount": max_amount }))
        .collect();
    Ok(Json(json!({ "items": items, "approvers": approvers })))
}

pub async fn by_merchant<C: Chain>(
    State(state): Shared<C>,
    Path(merchant): Path<String>,
    Query(params): Params,
) -> ApiResult<Json<Vec<Payment>>> {
    let merchant = account(&merchant, "merchant")?;
    let reference = params.get("reference").cloned();
    if reference
        .as_ref()
        .is_some_and(|r| r.is_empty() || r.len() > 64)
    {
        return Err(ApiError::BadRequest(
            "reference: expected 1 to 64 bytes".to_owned(),
        ));
    }
    let rows = sqlx::query_as(concat!(
        "select ",
        payment_columns!(),
        " from payments where merchant = $1 and ($2::text is null or reference = $2) \
         order by id desc limit 50"
    ))
    .bind(merchant)
    .bind(reference)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}
