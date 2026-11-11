//! Registry checks by risk mode.

use super::*;

#[test]
fn risk_mode_routes_through_the_registry() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    harness.pay(10);
    assert_eq!(
        harness.vault.get_payment(0).unwrap().status,
        PaymentStatus::Checking
    );
    harness.as_account(vault_id());
    harness
        .vault
        .on_registry_checked(0, false, Ok(RegistryStatus::Clear));
    assert_eq!(
        harness.vault.get_payment(0).unwrap().status,
        PaymentStatus::Transferring
    );
}

#[test]
fn blocked_merchant_fails_and_releases() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    harness.pay(10);
    harness.as_account(vault_id());
    harness
        .vault
        .on_registry_checked(0, false, Ok(RegistryStatus::Blocked));
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"cause\":\"merchant_blocked\""))
    );
    assert_eq!(harness.available(), 1_000);
    assert!(harness.vault.get_payment(0).is_none());
}

#[test]
fn registry_failure_fails_closed() {
    let mut harness = with_risk_mode(RiskMode::Strict);
    harness.pay(10);
    harness.as_account(vault_id());
    harness
        .vault
        .on_registry_checked(0, false, Err(PromiseError::Failed));
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"cause\":\"registry_unavailable\""))
    );
    assert_eq!(harness.available(), 1_000);
}

#[test]
fn flagged_merchant_queues_in_strict_mode_only() {
    let mut strict = with_risk_mode(RiskMode::Strict);
    strict.pay(10);
    strict.as_account(vault_id());
    strict
        .vault
        .on_registry_checked(0, false, Ok(RegistryStatus::Flagged));
    let payment = strict.vault.get_payment(0).unwrap();
    assert_eq!(payment.status, PaymentStatus::Queued);
    assert_eq!(payment.queue_cause, Some(QueueCause::RiskFlagged));

    strict.as_account(owner());
    strict.vault.approve_payment(0);
    strict.as_account(vault_id());
    strict
        .vault
        .on_registry_checked(0, true, Ok(RegistryStatus::Flagged));
    assert_eq!(
        strict.vault.get_payment(0).unwrap().status,
        PaymentStatus::Transferring
    );

    let mut block_only = with_risk_mode(RiskMode::BlockOnly);
    block_only.pay(10);
    block_only.as_account(vault_id());
    block_only
        .vault
        .on_registry_checked(0, false, Ok(RegistryStatus::Flagged));
    assert_eq!(
        block_only.vault.get_payment(0).unwrap().status,
        PaymentStatus::Transferring
    );
}
