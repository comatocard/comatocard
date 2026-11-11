//! Accountant CSV export, with optional fiat valuation at an operator-supplied rate.

use std::collections::BTreeMap;

use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::IntoResponse;

use std::collections::HashMap;

use super::{ApiError, ApiResult, Params, Shared, account, format, nanos};
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

/// Columns added when the export is valued in a fiat currency.
const FIAT_HEADER: [&str; 5] = [
    "fiat_currency",
    "fiat_amount",
    "fiat_rate",
    "rate_source",
    "rate_at",
];

/// An operator-supplied exchange rate. The export never fetches a rate itself, so every value
/// can be traced to the source the operator named (for tax, for example Bank Indonesia JISDOR).
struct Valuation {
    currency: String,
    rate: String,
    source: String,
    at: String,
}

/// Reads `fiat`, `rate`, `rate_source` and `rate_at`; all four or none.
fn valuation(params: &HashMap<String, String>) -> ApiResult<Option<Valuation>> {
    let keys = ["fiat", "rate", "rate_source", "rate_at"];
    let given: Vec<Option<&String>> = keys.iter().map(|k| params.get(*k)).collect();
    if given.iter().all(Option::is_none) {
        return Ok(None);
    }
    let bad = |message: &str| ApiError::BadRequest(message.to_owned());
    let [Some(currency), Some(rate), Some(source), Some(at)] = given[..] else {
        return Err(bad("fiat, rate, rate_source and rate_at go together"));
    };
    if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(bad("fiat: expected an ISO 4217 code such as IDR"));
    }
    let positive = rate.bytes().any(|b| (b'1'..=b'9').contains(&b));
    if format::fiat_value("1", 0, rate).is_none() || !positive {
        return Err(bad("rate: expected a positive decimal"));
    }
    if source.is_empty() || source.len() > 64 || at.is_empty() || at.len() > 32 {
        return Err(bad("rate_source: 1 to 64 bytes, rate_at: 1 to 32 bytes"));
    }
    Ok(Some(Valuation {
        currency: currency.clone(),
        rate: rate.clone(),
        source: source.clone(),
        at: at.clone(),
    }))
}

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
    let fiat = valuation(&params)?;
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
            let token_decimals = decimals.get(&r.token).copied().flatten();
            let units = token_decimals.map(|d| format::format_units(&r.amount, d));
            let fiat_cells = fiat.as_ref().map(|v| {
                vec![
                    Some(v.currency.clone()),
                    token_decimals.and_then(|d| format::fiat_value(&r.amount, d, &v.rate)),
                    Some(v.rate.clone()),
                    Some(v.source.clone()),
                    Some(v.at.clone()),
                ]
            });
            let mut row = vec![
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
            ];
            row.extend(fiat_cells.into_iter().flatten());
            row
        })
        .collect();
    let mut header: Vec<&str> = CSV_HEADER.to_vec();
    if fiat.is_some() {
        header.extend(FIAT_HEADER);
    }
    let disposition = format!("attachment; filename=\"{vault_id}-payments.csv\"");
    Ok((
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8".to_owned()),
            (header::CONTENT_DISPOSITION, disposition),
        ],
        format::to_csv(&header, &cells),
    ))
}
