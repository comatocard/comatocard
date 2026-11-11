//! Collects the signals for a counterparty from the database and the chain.

use sqlx::PgPool;

use super::rules::{Assessment, Signals, assess};
use crate::rpc::Chain;

/// Collects the signals for a counterparty from the database and the chain.
///
/// # Errors
/// Fails when the database cannot be read.
pub async fn assess_account<C: Chain>(
    pool: &PgPool,
    chain: &C,
    registry_id: Option<&str>,
    account_id: &str,
    vault_id: Option<&str>,
    now: u128,
) -> sqlx::Result<Assessment> {
    let status: Option<String> =
        match registry_id {
            Some(registry) => sqlx::query_scalar(
                "select status from registry_statuses where registry_id = $1 and account_id = $2",
            )
            .bind(registry)
            .bind(account_id)
            .fetch_optional(pool)
            .await?,
            None => None,
        };
    let evidence: Vec<String> = sqlx::query_scalar(
        "select evidence_uri from registry_reports where account_id = $1 and category = 'sanctions' \
         and ($2::text is null or registry_id = $2) order by report_id",
    )
    .bind(account_id)
    .bind(registry_id)
    .fetch_all(pool)
    .await?;
    let sanctions = evidence.iter().filter_map(|e| sanctions_entry(e)).collect();
    let report_count: i64 =
        sqlx::query_scalar("select count(*) from registry_reports where account_id = $1")
            .bind(account_id)
            .fetch_one(pool)
            .await?;
    let prior_payments: Option<i64> = match vault_id {
        Some(vault) => Some(
            sqlx::query_scalar(
                "select count(*) from payments where merchant = $1 and status = 'settled' and vault_id = $2",
            )
            .bind(account_id)
            .bind(vault)
            .fetch_one(pool)
            .await?,
        ),
        None => None,
    };
    let first_paid_at: Option<String> = sqlx::query_scalar(
        "select min(created_at)::text from payments where merchant = $1 and status = 'settled'",
    )
    .bind(account_id)
    .fetch_one(pool)
    .await?;

    let account = chain.account(account_id).await;
    let code_changed_at = match account.as_ref().and_then(|a| a.code_hash.as_deref()) {
        Some(hash) => code_changed_at(pool, account_id, hash, now).await?,
        None => None,
    };
    Ok(assess(&Signals {
        account_id: account_id.to_owned(),
        registry_status: status.unwrap_or_else(|| "clear".to_owned()),
        report_count,
        exists: account.as_ref().map(|a| a.exists),
        is_contract: account.as_ref().map(|a| a.code_hash.is_some()),
        code_changed_at,
        prior_payments,
        first_paid_at: first_paid_at.and_then(|v| v.parse().ok()),
        sanctions,
        now,
    }))
}

/// Records the observed code hash and returns when it was first seen, if another hash was seen
/// before it.
async fn code_changed_at(
    pool: &PgPool,
    account_id: &str,
    code_hash: &str,
    now: u128,
) -> sqlx::Result<Option<u128>> {
    sqlx::query(
        "insert into account_code (account_id, code_hash, first_seen_at) values ($1, $2, $3::numeric) on conflict do nothing",
    )
    .bind(account_id)
    .bind(code_hash)
    .bind(now.to_string())
    .execute(pool)
    .await?;
    let (first_seen, others): (String, i64) = sqlx::query_as(
        "select (select first_seen_at::text from account_code where account_id = $1 and code_hash = $2), \
         (select count(*) from account_code where account_id = $1 and code_hash <> $2)",
    )
    .bind(account_id)
    .bind(code_hash)
    .fetch_one(pool)
    .await?;
    Ok((others > 0).then(|| first_seen.parse().ok()).flatten())
}

/// `LIST (YYYY-MM-DD)` from evidence `sanctions:<LIST>:<YYYY-MM-DD>[:<reference>]`. The registry
/// validates the format; anything else is ignored.
fn sanctions_entry(evidence: &str) -> Option<String> {
    let mut parts = evidence.splitn(4, ':');
    (parts.next()? == "sanctions").then_some(())?;
    let list = parts.next()?;
    let date = parts.next()?;
    Some(format!("{list} ({date})"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_sanctions_evidence() {
        assert_eq!(
            sanctions_entry("sanctions:UN:2026-01-05:QDi.123").as_deref(),
            Some("UN (2026-01-05)")
        );
        assert_eq!(sanctions_entry("ipfs://evidence"), None);
    }
}
