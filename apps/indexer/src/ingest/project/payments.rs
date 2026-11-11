//! Payments: every attempt is one row; stored payments are keyed by vault and payment id.

use sqlx::PgConnection;

use super::{Origin, int};
use crate::events::{EventData, wire_name};

/// Applies an event of this group; the dispatcher in the parent module routes only these.
pub(super) async fn apply(
    db: &mut PgConnection,
    origin: &Origin,
    event: &EventData,
) -> sqlx::Result<()> {
    let at = origin.block_timestamp.as_str();
    let vault = origin.contract_id.as_str();
    match event {
        EventData::PaymentSubmitted(e) => {
            let payment = NewPayment {
                payment_id: e.payment_id,
                card_id: e.card_id,
                merchant: e.merchant.as_str(),
                token: e.token.as_str(),
                amount: e.amount.0,
                memo: e.memo.as_deref(),
                reference: e.reference.as_deref(),
            };
            store_payment(db, origin, &payment, "submitted", None).await?;
        }
        EventData::PaymentQueued(e) => {
            let payment = NewPayment {
                payment_id: e.payment_id,
                card_id: e.card_id,
                merchant: e.merchant.as_str(),
                token: e.token.as_str(),
                amount: e.amount.0,
                memo: e.memo.as_deref(),
                reference: e.reference.as_deref(),
            };
            store_payment(db, origin, &payment, "queued", Some(wire_name(&e.cause))).await?;
        }
        EventData::PaymentApproved(e) => {
            update_payment(
                db,
                origin,
                e.payment_id,
                "approved",
                None,
                Some(e.approver_id.to_string()),
            )
            .await?;
        }
        EventData::PaymentDeclined(e) => {
            update_payment(
                db,
                origin,
                e.payment_id,
                "declined",
                None,
                Some(e.approver_id.to_string()),
            )
            .await?;
        }
        EventData::PaymentExpired(e) => {
            update_payment(db, origin, e.payment_id, "expired", None, None).await?;
        }
        EventData::PaymentSettled(e) => {
            update_payment(db, origin, e.payment_id, "settled", None, None).await?;
        }
        EventData::PaymentFailed(e) => {
            update_payment(
                db,
                origin,
                e.payment_id,
                "failed",
                Some(wire_name(&e.cause)),
                None,
            )
            .await?;
        }
        EventData::PaymentRejected(e) => {
            sqlx::query(
                "insert into payments (vault_id, payment_id, card_id, merchant, token, amount, reference, status, reason, \
                 origin_receipt_id, origin_log_index, tx_hash, created_at, updated_at, updated_height) \
                 values ($1, null, $2, $3, $4, $5::numeric, $6, 'rejected', $7, $8, $9, $10, $11::numeric, $11::numeric, $12)",
            )
            .bind(vault)
            .bind(int(e.card_id))
            .bind(e.merchant.as_str())
            .bind(e.token.as_str())
            .bind(e.amount.0.to_string())
            .bind(e.reference.as_deref())
            .bind(wire_name(&e.reason))
            .bind(&origin.receipt_id)
            .bind(i64::from(origin.log_index))
            .bind(origin.tx_hash.as_deref())
            .bind(at)
            .bind(origin.height())
            .execute(&mut *db)
            .await?;
        }
        _ => {}
    }
    Ok(())
}

struct NewPayment<'a> {
    payment_id: u64,
    card_id: u64,
    merchant: &'a str,
    token: &'a str,
    amount: u128,
    memo: Option<&'a str>,
    reference: Option<&'a str>,
}

async fn update_payment(
    db: &mut PgConnection,
    origin: &Origin,
    payment_id: u64,
    status: &str,
    reason: Option<String>,
    approver: Option<String>,
) -> sqlx::Result<()> {
    sqlx::query(
        "update payments set status = $1, reason = coalesce($2, reason), \
         approver_id = coalesce($3, approver_id), updated_at = $4::numeric, updated_height = $5 \
         where vault_id = $6 and payment_id = $7",
    )
    .bind(status)
    .bind(reason)
    .bind(approver)
    .bind(&origin.block_timestamp)
    .bind(origin.height())
    .bind(&origin.contract_id)
    .bind(int(payment_id))
    .execute(db)
    .await
    .map(drop)
}

/// Inserts a submitted or queued payment; a strict mode re-queue updates the stored row.
async fn store_payment(
    db: &mut PgConnection,
    origin: &Origin,
    p: &NewPayment<'_>,
    status: &str,
    queue_cause: Option<String>,
) -> sqlx::Result<()> {
    sqlx::query(
        "insert into payments (vault_id, payment_id, card_id, merchant, token, amount, memo, reference, status, queue_cause, \
         origin_receipt_id, origin_log_index, tx_hash, created_at, updated_at, updated_height) \
         values ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10, $11, $12, $13, $14::numeric, $14::numeric, $15) \
         on conflict (vault_id, payment_id) where payment_id is not null do update set \
         status = excluded.status, queue_cause = excluded.queue_cause, updated_at = excluded.updated_at, \
         updated_height = excluded.updated_height",
    )
    .bind(&origin.contract_id)
    .bind(int(p.payment_id))
    .bind(int(p.card_id))
    .bind(p.merchant)
    .bind(p.token)
    .bind(p.amount.to_string())
    .bind(p.memo)
    .bind(p.reference)
    .bind(status)
    .bind(queue_cause)
    .bind(&origin.receipt_id)
    .bind(i64::from(origin.log_index))
    .bind(origin.tx_hash.as_deref())
    .bind(&origin.block_timestamp)
    .bind(origin.height())
    .execute(db)
    .await
    .map(drop)
}
