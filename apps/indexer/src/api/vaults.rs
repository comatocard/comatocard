//! Vaults and cards.

use std::collections::BTreeMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use serde::Serialize;
use serde_json::{Value, json};

use super::payments::{Payment, payment_columns};
use super::{ApiError, ApiResult, Params, Shared, account, format, number, required_account};
use crate::rpc::Chain;

/// Statuses that hold or spent a reservation.
pub const RESERVED_STATUSES: [&str; 4] = ["submitted", "queued", "approved", "settled"];

#[derive(Debug, Serialize, sqlx::FromRow, async_graphql::SimpleObject)]
#[expect(
    clippy::struct_field_names,
    reason = "field names are the API response keys"
)]
pub struct Card {
    vault_id: String,
    card_id: i32,
    public_key: Option<String>,
    holder_id: Option<String>,
    label: String,
    kind: String,
    status: String,
    policy: Value,
    created_at: String,
    updated_at: String,
}

macro_rules! card_columns {
    () => {
        "c.vault_id, c.card_id, c.public_key, c.holder_id, c.label, c.kind, c.status, c.policy, \
         c.created_at::text as created_at, c.updated_at::text as updated_at"
    };
}

#[derive(Debug, Serialize, sqlx::FromRow)]
struct VaultRow {
    vault_id: String,
    owner_id: String,
    pending_owner_id: Option<String>,
    factory_id: String,
    code_version: i32,
    created_at: String,
}

macro_rules! vault_columns {
    () => {
        "vault_id, owner_id, pending_owner_id, factory_id, code_version, created_at::text as created_at"
    };
}

pub async fn list<C: Chain>(
    State(state): Shared<C>,
    Query(params): Params,
) -> ApiResult<Json<Value>> {
    let owner = required_account(&params, "owner")?;
    let rows: Vec<VaultRow> = sqlx::query_as(concat!(
        "select ",
        vault_columns!(),
        " from vaults where owner_id = $1 order by created_height"
    ))
    .bind(owner)
    .fetch_all(&state.pool)
    .await?;
    let items: Vec<Value> = rows
        .into_iter()
        .map(|v| {
            json!({
                "vault_id": v.vault_id, "owner_id": v.owner_id, "factory_id": v.factory_id,
                "code_version": v.code_version, "created_at": v.created_at,
            })
        })
        .collect();
    Ok(Json(Value::Array(items)))
}

#[derive(Default)]
struct Balance {
    incoming: u128,
    outgoing: u128,
    reserved: u128,
}

pub async fn summary<C: Chain>(
    State(state): Shared<C>,
    Path(vault): Path<String>,
) -> ApiResult<Json<Value>> {
    let vault_id = account(&vault, "vault")?;
    let vault: VaultRow = sqlx::query_as(concat!(
        "select ",
        vault_columns!(),
        " from vaults where vault_id = $1"
    ))
    .bind(&vault_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("vault not found"))?;

    let mut balances: BTreeMap<String, Balance> = BTreeMap::new();
    let flows: Vec<(String, String, String)> = sqlx::query_as(
        "select token, kind, sum(amount)::text from token_flows where vault_id = $1 and success group by token, kind",
    )
    .bind(&vault_id)
    .fetch_all(&state.pool)
    .await?;
    for (token, kind, total) in flows {
        let entry = balances.entry(token).or_default();
        let total: u128 = total.parse().unwrap_or_default();
        if kind == "deposit" {
            entry.incoming += total;
        } else {
            entry.outgoing += total;
        }
    }
    let spent: Vec<(String, String, String)> = sqlx::query_as(
        "select token, status, sum(amount)::text from payments where vault_id = $1 and status = any($2) group by token, status",
    )
    .bind(&vault_id)
    .bind(&RESERVED_STATUSES[..])
    .fetch_all(&state.pool)
    .await?;
    for (token, status, total) in spent {
        let entry = balances.entry(token).or_default();
        let total: u128 = total.parse().unwrap_or_default();
        if status == "settled" {
            entry.outgoing += total;
        } else {
            entry.reserved += total;
        }
    }
    let today: Option<String> = sqlx::query_scalar(
        "select sum(amount)::text from payments where vault_id = $1 and status = any($2) and created_at >= $3::numeric",
    )
    .bind(&vault_id)
    .bind(&RESERVED_STATUSES[..])
    .bind(format::day_start((state.now)()).to_string())
    .fetch_one(&state.pool)
    .await?;
    let card_count: i64 = sqlx::query_scalar("select count(*) from cards where vault_id = $1")
        .bind(&vault_id)
        .fetch_one(&state.pool)
        .await?;
    let indexed: Vec<Value> = balances
        .into_iter()
        .map(|(token, b)| {
            let available = b.incoming.saturating_sub(b.outgoing).saturating_sub(b.reserved);
            json!({ "token": token, "available": available.to_string(), "reserved": b.reserved.to_string() })
        })
        .collect();
    Ok(Json(json!({
        "vault_id": vault.vault_id,
        "owner_id": vault.owner_id,
        "pending_owner_id": vault.pending_owner_id,
        "factory_id": vault.factory_id,
        "code_version": vault.code_version,
        "created_at": vault.created_at,
        "card_count": card_count,
        "spent_today": today.unwrap_or_else(|| "0".to_owned()),
        "indexed_balances": indexed,
    })))
}

/// Card tokens held by an account across vaults; a card without a holder belongs to the owner.
pub async fn cards_by_holder<C: Chain>(
    State(state): Shared<C>,
    Query(params): Params,
) -> ApiResult<Json<Vec<Card>>> {
    let holder = required_account(&params, "holder")?;
    let rows = sqlx::query_as(concat!("select ", card_columns!(), " from cards c join vaults v on v.vault_id = c.vault_id \
         where c.status <> 'revoked' and (c.holder_id = $1 or (c.holder_id is null and v.owner_id = $1)) \
         order by c.vault_id, c.card_id"))
    .bind(holder)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub async fn cards<C: Chain>(
    State(state): Shared<C>,
    Path(vault): Path<String>,
) -> ApiResult<Json<Vec<Card>>> {
    let vault_id = account(&vault, "vault")?;
    let rows = sqlx::query_as(concat!(
        "select ",
        card_columns!(),
        " from cards c where c.vault_id = $1 order by c.card_id"
    ))
    .bind(vault_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(rows))
}

pub async fn card<C: Chain>(
    State(state): Shared<C>,
    Path((vault, card)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let vault_id = account(&vault, "vault")?;
    let card_id = number(&card, "card")?;
    let row: Card = sqlx::query_as(concat!(
        "select ",
        card_columns!(),
        " from cards c where c.vault_id = $1 and c.card_id = $2"
    ))
    .bind(&vault_id)
    .bind(card_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound("card not found"))?;
    let recent: Vec<Payment> = sqlx::query_as(concat!(
        "select ",
        payment_columns!(),
        " from payments where vault_id = $1 and card_id = $2 order by id desc limit 20"
    ))
    .bind(&vault_id)
    .bind(card_id)
    .fetch_all(&state.pool)
    .await?;
    let mut body = serde_json::to_value(row).map_err(|e| ApiError::Internal(e.to_string()))?;
    body["recent_payments"] =
        serde_json::to_value(recent).map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(body))
}
