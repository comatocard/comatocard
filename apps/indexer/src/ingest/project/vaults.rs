//! Vaults, ownership and approvers.

use sqlx::PgConnection;

use super::{Origin, int};
use crate::events::EventData;

/// Applies an event of this group; the dispatcher in the parent module routes only these.
pub(super) async fn apply(
    db: &mut PgConnection,
    origin: &Origin,
    event: &EventData,
) -> sqlx::Result<()> {
    let at = origin.block_timestamp.as_str();
    let vault = origin.contract_id.as_str();
    match event {
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
        // vault_code_published has no projection; the event table keeps it.
        _ => {}
    }
    Ok(())
}
