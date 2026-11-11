//! Token flows: deposits and withdrawals.

use sqlx::PgConnection;

use super::Origin;
use crate::events::EventData;

/// Applies an event of this group; the dispatcher in the parent module routes only these.
pub(super) async fn apply(
    db: &mut PgConnection,
    origin: &Origin,
    event: &EventData,
) -> sqlx::Result<()> {
    match event {
        EventData::Deposit(e) => {
            token_flow(
                db,
                origin,
                "deposit",
                e.token.as_str(),
                e.sender_id.as_str(),
                e.amount.0,
                true,
            )
            .await?;
        }
        EventData::Withdrawal(e) => {
            token_flow(
                db,
                origin,
                "withdrawal",
                e.token.as_str(),
                e.receiver_id.as_str(),
                e.amount.0,
                e.success,
            )
            .await?;
        }
        _ => {}
    }
    Ok(())
}

async fn token_flow(
    db: &mut PgConnection,
    origin: &Origin,
    kind: &str,
    token: &str,
    counterparty: &str,
    amount: u128,
    success: bool,
) -> sqlx::Result<()> {
    sqlx::query(
        "insert into token_flows (receipt_id, log_index, vault_id, kind, token, counterparty, amount, success, tx_hash, created_at) \
         values ($1, $2, $3, $4, $5, $6, $7::numeric, $8, $9, $10::numeric)",
    )
    .bind(&origin.receipt_id)
    .bind(i64::from(origin.log_index))
    .bind(&origin.contract_id)
    .bind(kind)
    .bind(token)
    .bind(counterparty)
    .bind(amount.to_string())
    .bind(success)
    .bind(origin.tx_hash.as_deref())
    .bind(&origin.block_timestamp)
    .execute(db)
    .await
    .map(drop)
}
