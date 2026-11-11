//! Golden fixtures: the exact lines the vault emits, validated by the SDK and the indexer.
#[cfg(test)]
use near_sdk::json_types::U64;
use near_sdk::serde_json;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::testing_env;

use super::*;
use crate::types::{MerchantRule, PaymentStatus, RejectReason, RiskMode};

fn account(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn sample_payment() -> Payment {
    Payment {
        id: 3,
        card_id: 1,
        merchant: account("shop.testnet"),
        token: account("tusd.testnet"),
        amount: U128(25_000_000),
        memo: Some("api credits".to_owned()),
        reference: Some("inv-42".to_owned()),
        status: PaymentStatus::Transferring,
        queue_cause: None,
        approved_by: None,
        created_at: U64(1_800_000_000_000_000_000),
        day: 20_833,
        period: 694,
    }
}

/// Emits one event of every kind with representative data.
fn emit_all() {
    let key: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"
        .parse()
        .unwrap();
    let new_key: PublicKey = "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847"
        .parse()
        .unwrap();
    let policy = Policy {
        token: account("tusd.testnet"),
        per_tx_limit: U128(100_000_000),
        daily_limit: U128(150_000_000),
        monthly_limit: U128(1_000_000_000),
        approval_threshold: Some(U128(50_000_000)),
        merchants: MerchantRule::Allow(vec![account("shop.testnet")]),
        valid_from: None,
        expires_at: Some(U64(1_900_000_000_000_000_000)),
        risk_mode: RiskMode::Strict,
    };
    let owner = account("owner.testnet");
    let payment = sample_payment();
    card_created(1, &key, "research agent", CardKind::Agent, &policy);
    card_policy_updated(1, &policy);
    card_status("card_frozen", 1);
    card_status("card_unfrozen", 1);
    card_status("card_revoked", 1);
    card_key_rotated(1, Some(&key), &new_key);
    card_key_rotated(1, None, &new_key);
    card_key_rejected(1, &new_key);
    card_transferred(1, &owner, &account("agent.testnet"), Some("handover"));
    approver_set(&account("council.testnet"), Some(U128(80_000_000)));
    approver_set(&account("council.testnet"), None);
    deposit(&payment.token, &owner, U128(500_000_000));
    withdrawal(&payment.token, &owner, U128(10_000_000), true);
    payment_submitted(&payment);
    payment_queued(&payment, QueueCause::Threshold);
    payment_decided("payment_approved", 3, &owner);
    payment_decided("payment_declined", 3, &owner);
    payment_expired(3);
    payment_settled(&payment);
    payment_failed(&payment, FailureCause::TransferFailed);
    payment_rejected(&Rejection {
        card_id: 1,
        merchant: &payment.merchant,
        token: &payment.token,
        amount: U128(101_000_000),
        reason: RejectReason::PerTxLimit,
        reference: Some("inv-43"),
    });
    owner_event("owner_proposed", &account("dao.sputnik-v2.testnet"));
    owner_event("owner_changed", &account("dao.sputnik-v2.testnet"));
}

#[test]
fn golden_fixtures_match_the_sdk() {
    testing_env!(VMContextBuilder::new().build());
    emit_all();
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/sdk/test/fixtures/vault-events.jsonl");
    comatocard_common::golden::assert_matches(&path, &get_logs());
}

#[test]
fn reasons_serialize_in_snake_case() {
    assert_eq!(
        serde_json::to_string(&RejectReason::InsufficientBalance).unwrap(),
        r#""insufficient_balance""#
    );
    assert_eq!(
        serde_json::to_string(&FailureCause::RegistryUnavailable).unwrap(),
        r#""registry_unavailable""#
    );
    assert_eq!(
        serde_json::to_string(&QueueCause::RiskFlagged).unwrap(),
        r#""risk_flagged""#
    );
}
