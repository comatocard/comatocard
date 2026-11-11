//! Settled spend by card, merchant and UTC day, plus rejection counts by reason.

use axum::Json;
use axum::extract::{Path, Query, State};
use serde_json::{Value, json};

use super::{ApiResult, Params, Shared, account, format, nanos};
use crate::rpc::Chain;

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
