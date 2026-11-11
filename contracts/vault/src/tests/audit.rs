//! Regressions for the contract audit, named after their issues.

use super::*;

#[test]
fn issue_49_transfer_declines_queued_payments() {
    let mut harness = Harness::new();
    let PaymentDecision::Submitted {
        payment_id: in_flight,
    } = harness.pay(10)
    else {
        panic!("small payment should be submitted");
    };
    let PaymentDecision::Queued {
        payment_id: queued, ..
    } = harness.pay(60)
    else {
        panic!("large payment should be queued");
    };
    harness.transfer(owner(), agent());
    assert!(has_event("payment_declined"));
    assert!(harness.vault.get_payment(queued).is_none());
    assert!(harness.vault.get_payment(in_flight).is_some());
    assert_eq!(harness.reserved(), 10);
    assert_eq!(harness.day_spent(), 10);
}

#[test]
#[should_panic(expected = "attach at least 80 Tgas")]
fn issue_58_pay_requires_gas_for_every_callback() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    testing_env!(
        harness
            .context
            .predecessor_account_id(vault_id())
            .signer_account_pk(card_key())
            .prepaid_gas(near_sdk::Gas::from_tgas(50))
            .build()
    );
    harness.vault.pay(shop(), U128(10), None, None);
}

#[test]
fn issue_58_a_stuck_registry_check_is_recovered_after_the_ttl() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    harness.pay(10);
    assert_eq!(harness.reserved(), 10);
    harness.at(NOW + crate::DEFAULT_APPROVAL_TTL_NS);
    harness.as_account(shop());
    harness.vault.recover_payment(0);
    assert!(harness.vault.get_payment(0).is_none());
    assert_eq!((harness.available(), harness.reserved()), (1_000, 0));
    assert_eq!(harness.day_spent(), 0);
}

#[test]
#[should_panic(expected = "approval time has not run out yet")]
fn issue_58_recovery_waits_for_the_ttl() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    harness.pay(10);
    harness.vault.recover_payment(0);
}

#[test]
#[should_panic(expected = "only a payment stuck in the registry check can be recovered")]
fn issue_58_a_transfer_in_flight_is_never_recovered() {
    let mut harness = Harness::new();
    harness.pay(10);
    harness.at(NOW + crate::DEFAULT_APPROVAL_TTL_NS);
    harness.vault.recover_payment(0);
}

#[test]
fn issue_59_a_key_the_account_already_has_is_unmapped_and_kept() {
    let mut harness = Harness::new();
    harness.as_account(vault_id());
    harness
        .vault
        .on_card_key_added(0, card_key(), Err(PromiseError::Failed));
    assert!(has_event("card_key_rejected"));
    assert!(harness.vault.get_card_by_key(card_key()).is_none());
    assert_eq!(harness.vault.get_card(0).unwrap().public_key, None);
    // A later rotation must not delete the key the vault never added.
    harness.as_account(owner());
    harness.vault.rotate_card_key(0, other_key(), None);
    assert_eq!(
        near_sdk::test_utils::get_created_receipts()
            .iter()
            .flat_map(|r| r.actions.iter())
            .filter(|a| matches!(a, near_sdk::mock::MockAction::DeleteKey { .. }))
            .count(),
        0
    );
}

#[test]
fn issue_59_a_confirmed_key_stays_mapped() {
    let mut harness = Harness::new();
    harness.as_account(vault_id());
    harness.vault.on_card_key_added(0, card_key(), Ok(()));
    assert!(!has_event("card_key_rejected"));
    assert_eq!(harness.vault.get_card_by_key(card_key()).unwrap().id, 0);
}

#[test]
fn issue_59_a_late_failure_for_a_replaced_key_changes_nothing() {
    let mut harness = Harness::new();
    harness.vault.rotate_card_key(0, other_key(), None);
    harness.as_account(vault_id());
    harness
        .vault
        .on_card_key_added(0, card_key(), Err(PromiseError::Failed));
    assert_eq!(harness.vault.get_card_by_key(other_key()).unwrap().id, 0);
}

#[test]
fn issue_60_a_card_queues_at_most_ten_payments() {
    let mut harness = queueing();
    for _ in 0..crate::types::MAX_QUEUED_PER_CARD {
        assert!(matches!(harness.pay(2), PaymentDecision::Queued { .. }));
    }
    assert_eq!(
        harness.pay(2),
        PaymentDecision::Rejected {
            reason: RejectReason::QueueFull
        }
    );
    assert_eq!(
        harness.reserved(),
        20,
        "the rejected payment reserved nothing"
    );
    // Settling the queue frees a slot.
    harness.as_account(owner());
    harness.vault.decline_payment(0);
    assert!(matches!(harness.pay(2), PaymentDecision::Queued { .. }));
}

#[test]
fn issue_60_every_way_out_of_the_queue_frees_its_slot() {
    let mut harness = queueing();
    for _ in 0..3 {
        harness.pay(2);
    }
    harness.as_account(owner());
    harness.vault.approve_payment(0);
    harness.vault.decline_payment(1);
    harness.at(NOW + crate::DEFAULT_APPROVAL_TTL_NS);
    harness.vault.expire_payment(2);
    for _ in 0..crate::types::MAX_QUEUED_PER_CARD {
        assert!(matches!(harness.pay(2), PaymentDecision::Queued { .. }));
    }
}

#[test]
fn issue_60_a_handover_declines_only_this_cards_queue() {
    let mut harness = queueing();
    harness.vault.create_card(
        other_key(),
        "second".to_owned(),
        CardKind::Agent,
        policy(),
        None,
    );
    harness.pay(2);
    harness.as_card(other_key());
    let PaymentDecision::Queued {
        payment_id: other, ..
    } = harness.vault.pay(shop(), U128(60), None, None)
    else {
        panic!("second card queues above its threshold");
    };
    harness.transfer(owner(), agent());
    assert!(harness.vault.get_payment(0).is_none());
    assert!(harness.vault.get_payment(other).is_some());
}

#[test]
fn issue_60_a_strict_requeue_into_a_full_queue_fails_the_payment() {
    let mut harness = queueing();
    let mut strict = harness.vault.get_card(0).unwrap().policy;
    strict.risk_mode = RiskMode::Strict;
    strict.approval_threshold = Some(U128(5));
    harness.vault.update_policy(0, strict);
    for _ in 0..crate::types::MAX_QUEUED_PER_CARD {
        harness.pay(6);
    }
    let PaymentDecision::Submitted { payment_id } = harness.pay(3) else {
        panic!("a small payment goes to the registry");
    };
    harness.as_account(vault_id());
    harness
        .vault
        .on_registry_checked(payment_id, false, Ok(RegistryStatus::Flagged));
    assert!(harness.vault.get_payment(payment_id).is_none());
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"cause\":\"queue_full\""))
    );
}

#[test]
fn issue_61_risk_mode_without_a_registry_fails_closed() {
    let mut harness = with_risk_mode(RiskMode::BlockOnly);
    harness.vault.set_registry(None);
    harness.pay(10);
    assert!(harness.vault.get_payment(0).is_none());
    assert!(
        get_logs()
            .iter()
            .any(|log| log.contains("\"cause\":\"registry_unavailable\""))
    );
    assert_eq!((harness.available(), harness.reserved()), (1_000, 0));
}

#[test]
fn issue_62_a_new_owner_inherits_no_keys_queues_or_approvers() {
    let mut harness = Harness::new();
    harness
        .vault
        .set_approver(id("council.near"), Some(U128(80)));
    harness.vault.create_card(
        other_key(),
        "handed".to_owned(),
        CardKind::Agent,
        policy(),
        None,
    );
    assert!(matches!(harness.pay(60), PaymentDecision::Queued { .. }));
    // Card 1 goes to an agent before the ownership change and keeps its holder.
    harness.with_deposit(owner(), NearToken::from_yoctonear(1));
    harness
        .vault
        .nft_transfer(agent(), "1".to_owned(), None, None);
    harness.with_deposit(agent(), MIN_HOLDER_ALLOWANCE);
    harness.vault.set_card_key(1, other_key());

    harness.with_deposit(owner(), NearToken::from_yoctonear(0));
    harness.vault.propose_owner(id("dao.near"));
    harness.as_account(id("dao.near"));
    harness.vault.accept_owner();

    let owner_card = harness.vault.get_card(0).unwrap();
    assert_eq!((owner_card.holder, owner_card.public_key), (None, None));
    assert!(
        harness.vault.get_payment(0).is_none(),
        "the old queue is declined"
    );
    assert!(harness.vault.list_approvers().is_empty());
    assert_eq!(
        harness.vault.nft_token("0".to_owned()).unwrap().owner_id,
        id("dao.near")
    );
    let agent_card = harness.vault.get_card(1).unwrap();
    assert_eq!(agent_card.holder, Some(agent()));
    assert_eq!(agent_card.public_key, Some(other_key()));
}
