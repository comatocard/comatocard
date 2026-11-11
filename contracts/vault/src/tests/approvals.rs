//! The approval queue: approvers, decline and expiry.

use super::*;

#[test]
fn large_payment_queues_and_approver_within_limit_approves() {
    let mut harness = Harness::new();
    harness
        .vault
        .set_approver(id("council.near"), Some(U128(80)));
    let decision = harness.pay(60);
    assert_eq!(
        decision,
        PaymentDecision::Queued {
            payment_id: 0,
            cause: QueueCause::Threshold
        }
    );
    assert_eq!(harness.reserved(), 60);

    harness.as_account(id("council.near"));
    harness.vault.approve_payment(0);
    assert!(has_event("payment_approved"));
    assert_eq!(
        harness.vault.get_payment(0).unwrap().status,
        PaymentStatus::Transferring
    );
}

#[test]
#[should_panic(expected = "amount exceeds the approver limit")]
fn approver_cannot_exceed_its_limit() {
    let mut harness = Harness::new();
    harness
        .vault
        .set_approver(id("council.near"), Some(U128(55)));
    harness.pay(60);
    harness.as_account(id("council.near"));
    harness.vault.approve_payment(0);
}

#[test]
#[should_panic(expected = "only the owner or an approver may decide")]
fn strangers_cannot_approve() {
    let mut harness = Harness::new();
    harness.pay(60);
    harness.as_account(shop());
    harness.vault.approve_payment(0);
}

#[test]
#[should_panic(expected = "card is not active")]
fn queued_payment_of_frozen_card_cannot_be_approved() {
    let mut harness = Harness::new();
    harness.pay(60);
    harness.as_account(owner());
    harness.vault.freeze_card(0);
    harness.vault.approve_payment(0);
}

#[test]
fn decline_releases_the_reservation() {
    let mut harness = Harness::new();
    harness.pay(60);
    harness.as_account(owner());
    harness.vault.decline_payment(0);
    assert!(has_event("payment_declined"));
    assert_eq!(harness.available(), 1_000);
    assert_eq!(harness.reserved(), 0);
    assert_eq!(harness.day_spent(), 0);
}

#[test]
#[should_panic(expected = "approval time has not run out yet")]
fn expire_waits_for_the_ttl() {
    let mut harness = Harness::new();
    harness.pay(60);
    harness.as_account(shop());
    harness.vault.expire_payment(0);
}

#[test]
fn anyone_can_expire_after_the_ttl() {
    let mut harness = Harness::new();
    harness.pay(60);
    harness.as_account(shop());
    harness.at(NOW + crate::DEFAULT_APPROVAL_TTL_NS);
    harness.vault.expire_payment(0);
    assert!(has_event("payment_expired"));
    assert_eq!(harness.available(), 1_000);
}

#[test]
#[should_panic(expected = "approval time ran out, expire the payment instead")]
fn issue_63_approval_respects_the_ttl() {
    let mut harness = queued_payment();
    harness.at(NOW + crate::DEFAULT_APPROVAL_TTL_NS);
    harness.vault.approve_payment(0);
}

#[test]
#[should_panic(expected = "card is outside its validity window")]
fn issue_63_approval_respects_the_validity_window() {
    let mut harness = queued_payment();
    let mut expiring = policy();
    expiring.expires_at = Some(U64(NOW + 1));
    harness.vault.update_policy(0, expiring);
    harness.at(NOW + 1);
    harness.vault.approve_payment(0);
}

#[test]
#[should_panic(expected = "merchant is no longer allowed")]
fn issue_63_approval_respects_the_merchant_rule() {
    let mut harness = queued_payment();
    let mut deny = policy();
    deny.merchants = MerchantRule::Deny(vec![shop()]);
    harness.vault.update_policy(0, deny);
    harness.vault.approve_payment(0);
}
