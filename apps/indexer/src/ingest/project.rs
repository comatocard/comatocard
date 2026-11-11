//! Applies one validated event to the projections. Called inside the transaction that stores the
//! raw event, and only when the raw event was new, so replays never double count.

use sqlx::PgConnection;

use crate::events::{EventData, wire_name};

/// Where an event was recorded.
#[derive(Debug, Clone)]
pub struct Origin {
    pub contract_id: String,
    pub receipt_id: String,
    pub log_index: u32,
    pub block_height: u64,
    pub block_timestamp: String,
    pub tx_hash: Option<String>,
}

impl Origin {
    fn height(&self) -> i64 {
        i64::try_from(self.block_height).unwrap_or(i64::MAX)
    }
}

fn int(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
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

async fn card_status(
    db: &mut PgConnection,
    origin: &Origin,
    card_id: u64,
    status: &str,
) -> sqlx::Result<()> {
    sqlx::query(
        "update cards set status = $1, updated_at = $2::numeric where vault_id = $3 and card_id = $4",
    )
    .bind(status)
    .bind(&origin.block_timestamp)
    .bind(&origin.contract_id)
    .bind(int(card_id))
    .execute(db)
    .await
    .map(drop)
}

#[allow(
    clippy::too_many_lines,
    reason = "one arm per event keeps the mapping readable"
)]
pub async fn project(
    db: &mut PgConnection,
    origin: &Origin,
    event: &EventData,
) -> sqlx::Result<()> {
    let at = origin.block_timestamp.as_str();
    let vault = origin.contract_id.as_str();
    match event {
        EventData::VaultCodePublished(_) => {}
        EventData::VaultCreated(e) => {
            sqlx::query(
                "insert into vaults (vault_id, owner_id, factory_id, code_version, created_height, created_at) \
                 values ($1, $2, $3, $4, $5, $6::numeric) on conflict do nothing",
            )
            .bind(e.vault_id.as_str())
            .bind(e.owner_id.as_str())
            .bind(vault)
            .bind(int(e.code_version))
            .bind(origin.height())
            .bind(at)
            .execute(&mut *db)
            .await?;
        }
        EventData::OwnerProposed(e) => {
            sqlx::query("update vaults set pending_owner_id = $1 where vault_id = $2")
                .bind(e.owner_id.as_str())
                .bind(vault)
                .execute(&mut *db)
                .await?;
        }
        EventData::OwnerChanged(e) => {
            sqlx::query(
                "update vaults set owner_id = $1, pending_owner_id = null where vault_id = $2",
            )
            .bind(e.owner_id.as_str())
            .bind(vault)
            .execute(&mut *db)
            .await?;
        }
        EventData::CardCreated(e) => {
            sqlx::query(
                "insert into cards (vault_id, card_id, public_key, label, kind, status, policy, created_at, updated_at) \
                 values ($1, $2, $3, $4, $5, 'active', $6, $7::numeric, $7::numeric)",
            )
            .bind(vault)
            .bind(int(e.card_id))
            .bind(e.public_key.to_string())
            .bind(&e.label)
            .bind(wire_name(&e.kind))
            .bind(&e.policy)
            .bind(at)
            .execute(&mut *db)
            .await?;
        }
        EventData::CardPolicyUpdated(e) => {
            sqlx::query(
                "update cards set policy = $1, updated_at = $2::numeric where vault_id = $3 and card_id = $4",
            )
            .bind(&e.policy)
            .bind(at)
            .bind(vault)
            .bind(int(e.card_id))
            .execute(&mut *db)
            .await?;
        }
        EventData::CardFrozen(e) => card_status(db, origin, e.card_id, "frozen").await?,
        EventData::CardUnfrozen(e) => card_status(db, origin, e.card_id, "active").await?,
        EventData::CardRevoked(e) => card_status(db, origin, e.card_id, "revoked").await?,
        EventData::CardKeyRotated(e) => {
            sqlx::query(
                "update cards set public_key = $1, updated_at = $2::numeric where vault_id = $3 and card_id = $4",
            )
            .bind(e.new_public_key.to_string())
            .bind(at)
            .bind(vault)
            .bind(int(e.card_id))
            .execute(&mut *db)
            .await?;
        }
        EventData::CardTransferred(e) => {
            // Mirrors the contract: a card handed back to the owner follows future ownership.
            sqlx::query(
                "update cards set holder_id = nullif($1, (select owner_id from vaults where vault_id = $3)), \
                 public_key = null, updated_at = $2::numeric where vault_id = $3 and card_id = $4",
            )
            .bind(e.new_holder.as_str())
            .bind(at)
            .bind(vault)
            .bind(int(e.card_id))
            .execute(&mut *db)
            .await?;
        }
        EventData::CardKeyRejected(e) => {
            sqlx::query(
                "update cards set public_key = null, updated_at = $1::numeric \
                 where vault_id = $2 and card_id = $3 and public_key = $4",
            )
            .bind(at)
            .bind(vault)
            .bind(int(e.card_id))
            .bind(e.public_key.to_string())
            .execute(&mut *db)
            .await?;
        }
        EventData::ApproverSet(e) => match e.max_amount {
            None => {
                sqlx::query("delete from approvers where vault_id = $1 and account_id = $2")
                    .bind(vault)
                    .bind(e.account_id.as_str())
                    .execute(&mut *db)
                    .await?;
            }
            Some(max) => {
                sqlx::query(
                    "insert into approvers (vault_id, account_id, max_amount) values ($1, $2, $3::numeric) \
                     on conflict (vault_id, account_id) do update set max_amount = excluded.max_amount",
                )
                .bind(vault)
                .bind(e.account_id.as_str())
                .bind(max.0.to_string())
                .execute(&mut *db)
                .await?;
            }
        },
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
        EventData::ReportSubmitted(e) => {
            sqlx::query(
                "insert into registry_reports (registry_id, report_id, account_id, reporter_id, category, evidence_uri, created_at) \
                 values ($1, $2, $3, $4, $5, $6, $7::numeric)",
            )
            .bind(vault)
            .bind(int(e.report_id))
            .bind(e.account_id.as_str())
            .bind(e.reporter_id.as_str())
            .bind(wire_name(&e.category))
            .bind(&e.evidence_uri)
            .bind(at)
            .execute(&mut *db)
            .await?;
        }
        EventData::StatusChanged(e) => {
            sqlx::query(
                "insert into registry_statuses (registry_id, account_id, status, curator_id, report_ids, updated_at) \
                 values ($1, $2, $3, $4, $5, $6::numeric) on conflict (registry_id, account_id) do update set \
                 status = excluded.status, curator_id = excluded.curator_id, report_ids = excluded.report_ids, \
                 updated_at = excluded.updated_at",
            )
            .bind(vault)
            .bind(e.account_id.as_str())
            .bind(wire_name(&e.status))
            .bind(e.curator_id.as_str())
            .bind(serde_json::json!(e.report_ids))
            .bind(at)
            .execute(&mut *db)
            .await?;
        }
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

struct NewPayment<'a> {
    payment_id: u64,
    card_id: u64,
    merchant: &'a str,
    token: &'a str,
    amount: u128,
    memo: Option<&'a str>,
    reference: Option<&'a str>,
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
