//! Registry reports and curator statuses.

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
        _ => {}
    }
    Ok(())
}
