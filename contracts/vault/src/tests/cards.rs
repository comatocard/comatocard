//! Card issuance, policies and keys.

use super::*;

#[test]
#[should_panic(expected = "public key already belongs to a card")]
fn create_card_rejects_duplicate_key() {
    let mut harness = Harness::new();
    harness.vault.create_card(
        card_key(),
        "dup".to_owned(),
        CardKind::Human,
        policy(),
        None,
    );
}

#[test]
#[should_panic(expected = "approval_threshold must be below per_tx_limit")]
fn create_card_validates_policy() {
    let mut harness = Harness::new();
    let mut bad = policy();
    bad.approval_threshold = Some(U128(100));
    harness
        .vault
        .create_card(other_key(), "bad".to_owned(), CardKind::Human, bad, None);
}

#[test]
fn frozen_card_is_rejected_until_unfrozen() {
    let mut harness = Harness::new();
    harness.vault.freeze_card(0);
    assert_eq!(
        harness.pay(10),
        PaymentDecision::Rejected {
            reason: RejectReason::CardFrozen
        }
    );
    harness.as_account(owner());
    harness.vault.unfreeze_card(0);
    assert!(matches!(harness.pay(10), PaymentDecision::Submitted { .. }));
}

#[test]
fn revoked_card_key_no_longer_resolves() {
    let mut harness = Harness::new();
    harness.vault.revoke_card(0);
    assert!(has_event("card_revoked"));
    assert_eq!(
        harness.vault.get_card(0).unwrap().status,
        CardStatus::Revoked
    );
    assert!(harness.vault.get_card_by_key(card_key()).is_none());
}

#[test]
fn rotated_key_replaces_the_old_key() {
    let mut harness = Harness::new();
    harness.vault.rotate_card_key(0, other_key(), None);
    assert!(harness.vault.get_card_by_key(card_key()).is_none());
    assert_eq!(harness.vault.get_card_by_key(other_key()).unwrap().id, 0);
    harness.as_card(other_key());
    assert!(matches!(
        harness.vault.pay(shop(), U128(10), None, None),
        PaymentDecision::Submitted { .. }
    ));
}

#[test]
#[should_panic(expected = "only the owner may call this method")]
fn create_card_is_owner_only() {
    let mut harness = Harness::new();
    harness.as_account(shop());
    harness
        .vault
        .create_card(other_key(), "x".to_owned(), CardKind::Human, policy(), None);
}
