//! Accountant CSV export and spend analytics.

use std::collections::BTreeMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::IntoResponse;
use serde_json::{Value, json};

use super::{ApiResult, Params, Shared, account, format, nanos};
use crate::rpc::Chain;

const CSV_HEADER: [&str; 14] = [
    "date_utc",
    "card_id",
    "card_label",
    "merchant",
    "token",
    "amount",
    "amount_raw",
    "status",
    "queue_cause",
    "reason",
    "reference",
    "memo",
    "payment_id",
    "transaction_hash",
];

#[derive(sqlx::FromRow)]
struct ExportRow {
    created_at: String,
    card_id: i32,
    label: Option<String>,
    merchant: String,
    token: String,
    amount: String,
    status: String,
    queue_cause: Option<String>,
    reason: Option<String>,
    reference: Option<String>,
    memo: Option<String>,
    payment_id: Option<i64>,
    tx_hash: Option<String>,
}

pub async fn export_csv<C: Chain>(
    State(state): Shared<C>,
    Path(vault): Path<String>,
    Query(params): Params,
) -> ApiResult<impl IntoResponse> {
    let vault_id = account(&vault, "vault")?;
    let from = nanos(&params, "from")?;
    let to = nanos(&params, "to")?;
    let rows: Vec<ExportRow> = sqlx::query_as(
        "select p.created_at::text as created_at, p.card_id, c.label, p.merchant, p.token, p.amount::text as amount, \
         p.status, p.queue_cause, p.reason, p.reference, p.memo, p.payment_id, p.tx_hash \
         from payments p left join cards c on c.vault_id = p.vault_id and c.card_id = p.card_id \
         where p.vault_id = $1 and ($2::numeric is null or p.created_at >= $2::numeric) \
         and ($3::numeric is null or p.created_at <= $3::numeric) order by p.id",
    )
    .bind(&vault_id)
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await?;
    let mut decimals: BTreeMap<String, Option<u32>> = BTreeMap::new();
    for row in &rows {
        if !decimals.contains_key(&row.token) {
            let value = state.chain.decimals(&row.token).await;
            decimals.insert(row.token.clone(), value);
        }
    }
    let cells: Vec<Vec<Option<String>>> = rows
        .into_iter()
        .map(|r| {
            let units = decimals
                .get(&r.token)
                .copied()
                .flatten()
                .map(|d| format::format_units(&r.amount, d));
            vec![
                Some(format::iso_from_nanos(&r.created_at)),
                Some(r.card_id.to_string()),
                r.label,
                Some(r.merchant),
                Some(r.token),
                units,
                Some(r.amount),
                Some(r.status),
                r.queue_cause,
                r.reason,
                r.reference,
                r.memo,
                r.payment_id.map(|id| id.to_string()),
                r.tx_hash,
            ]
        })
        .collect();
    let disposition = format!("attachment; filename=\"{vault_id}-payments.csv\"");
    Ok((
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_owned()),
            (header::CONTENT_DISPOSITION, disposition),
        ],
        format::to_csv(&CSV_HEADER, &cells),
    ))
}

pub async fn analytics<C: Chain>(
    State(state): Shared<C>,
    Path(vault): Path<String>,
    Query(params): Params,
) -> ApiResult<Json<Value>> {
    let vault_id = account(&vault, "vault")?;
    let from = nanos(&params, "from")?;
    let to = nanos(&params, "to")?;
    macro_rules! settled {
        () => {
            "vault_id = $1 and status = 'settled' and ($2::numeric is null or created_at >= $2::numeric) \
             and ($3::numeric is null or created_at <= $3::numeric)"
        };
    }
    let by_card: Vec<(i32, String, String)> = sqlx::query_as(concat!(
        "select card_id, token, sum(amount)::text from payments where ",
        settled!(),
        " group by card_id, token order by card_id, token"
    ))
    .bind(&vault_id)
    .bind(&from)
    .bind(&to)
    .fetch_all(&state.pool)
    .await?;
    let by_merchant: Vec<(String, String, String)> = sqlx::query_as(concat!(
        "select merchant, token, sum(amount)::text from payments where ",
        settled!(),
        " group by merchant, token order by merchant, token"
    ))
    .bind(&vault_id)
    .bind(&from)
    .bind(&to)
    .fetch_all(&state.pool)
    .await?;
    let by_day: Vec<(i64, String, String)> = sqlx::query_as(concat!("select div(created_at, 86400000000000)::bigint as day, token, sum(amount)::text from payments \
         where ", settled!(), " group by day, token order by day, token"))
    .bind(&vault_id)
    .bind(&from)
    .bind(&to)
    .fetch_all(&state.pool)
    .await?;
    let rejections: Vec<(Option<String>, i64)> = sqlx::query_as(
        "select reason, count(*) from payments where vault_id = $1 and status = 'rejected' group by reason order by reason",
    )
    .bind(&vault_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({
        "by_card": by_card.into_iter().map(|(card_id, token, total)| json!({ "card_id": card_id, "token": token, "total": total })).collect::<Vec<_>>(),
        "by_merchant": by_merchant.into_iter().map(|(merchant, token, total)| json!({ "merchant": merchant, "token": token, "total": total })).collect::<Vec<_>>(),
        "by_day": by_day.into_iter().map(|(day, token, total)| json!({ "date": format::date_of_day(day), "token": token, "total": total })).collect::<Vec<_>>(),
        "rejections": rejections.into_iter().map(|(reason, count)| json!({ "reason": reason, "count": count })).collect::<Vec<_>>(),
    })))
}
