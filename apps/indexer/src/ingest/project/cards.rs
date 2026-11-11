//! Cards: creation, policy, status, keys and token transfers.

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
        _ => {}
    }
    Ok(())
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
