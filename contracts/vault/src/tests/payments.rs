//! The payment path: reservations, limits, settlement.

use super::*;

#[test]
#[should_panic(expected = "pay must be signed with a card key")]
fn pay_requires_the_vault_as_predecessor() {
    let mut harness = Harness::new();
    harness.as_account(owner());
    harness.vault.pay(shop(), U128(10), None, None);
}

#[test]
fn small_payment_reserves_then_settles() {
    let mut harness = Harness::new();
    let decision = harness.pay(40);
    assert_eq!(decision, PaymentDecision::Submitted { payment_id: 0 });
    assert!(has_event("payment_submitted"));
    assert_eq!(harness.available(), 960);
    assert_eq!(harness.reserved(), 40);
    assert_eq!(harness.day_spent(), 40);
    assert_eq!(
        harness.vault.get_payment(0).unwrap().status,
        PaymentStatus::Transferring
    );

    harness.as_account(vault_id());
    harness.vault.on_payment_transferred(0, Ok(()));
    assert!(has_event("payment_settled"));
    assert_eq!(harness.available(), 960);
    assert_eq!(harness.reserved(), 0);
    assert_eq!(harness.day_spent(), 40);
    assert!(harness.vault.get_payment(0).is_none());
}

#[test]
fn rejection_is_recorded_without_state_change() {
    let mut harness = Harness::new();
    let decision = harness.pay(101);
    assert_eq!(
        decision,
        PaymentDecision::Rejected {
            reason: RejectReason::PerTxLimit
        }
    );
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"reason\":\"per_tx_limit\""))
    );
    assert_eq!(harness.available(), 1_000);
    assert_eq!(harness.day_spent(), 0);
    assert!(harness.vault.list_payments(None, None).is_empty());
}

#[test]
fn concurrent_reservations_cannot_exceed_the_daily_limit() {
    let mut harness = Harness::new();
    assert!(matches!(harness.pay(50), PaymentDecision::Submitted { .. }));
    assert!(matches!(harness.pay(50), PaymentDecision::Submitted { .. }));
    assert!(matches!(harness.pay(50), PaymentDecision::Submitted { .. }));
    assert_eq!(
        harness.pay(1),
        PaymentDecision::Rejected {
            reason: RejectReason::DailyLimit
        }
    );
}

#[test]
fn preview_matches_pay_without_side_effects() {
    let mut harness = Harness::new();
    let preview = |h: &Harness, amount| h.vault.preview_payment(card_key(), shop(), U128(amount));
    assert_eq!(preview(&harness, 10), PaymentPreview::Allowed);
    assert_eq!(
        preview(&harness, 60),
        PaymentPreview::NeedsApproval {
            cause: QueueCause::Threshold
        }
    );
    assert_eq!(
        preview(&harness, 101),
        PaymentPreview::Rejected {
            reason: RejectReason::PerTxLimit
        }
    );
    harness.as_account(owner());
    assert_eq!(harness.available(), 1_000);
}

#[test]
fn spend_resets_on_a_new_day() {
    let mut harness = Harness::new();
    harness.pay(50);
    harness.pay(50);
    harness.pay(50);
    harness.at(NOW + crate::policy::DAY_NS);
    assert_eq!(harness.day_spent(), 0);
    assert!(matches!(harness.pay(50), PaymentDecision::Submitted { .. }));
}

#[test]
fn failed_transfer_releases_funds_and_spend() {
    let mut harness = Harness::new();
    harness.pay(40);
    harness.as_account(vault_id());
    harness
        .vault
        .on_payment_transferred(0, Err(PromiseError::Failed));
    assert!(has_event("payment_failed"));
    assert_eq!(harness.available(), 1_000);
    assert_eq!(harness.reserved(), 0);
    assert_eq!(harness.day_spent(), 0);
}

#[test]
#[should_panic(expected = "signer key is not a card")]
fn pay_requires_a_card_key() {
    let mut harness = Harness::new();
    harness.as_card(other_key());
    harness.vault.pay(shop(), U128(10), None, None);
}
