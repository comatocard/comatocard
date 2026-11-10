//! Vault events. The schema is documented in `docs/specs/events.md`.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{AccountId, PublicKey};

use crate::types::{
    CardId, CardKind, FailureCause, Payment, PaymentId, Policy, QueueCause, RejectReason,
};

use comatocard_common::events::emit;

pub fn card_created(
    card_id: CardId,
    public_key: &PublicKey,
    label: &str,
    kind: CardKind,
    policy: &Policy,
) {
    emit(
        "card_created",
        &json!({
            "card_id": card_id,
            "public_key": public_key,
            "label": label,
            "kind": kind,
            "policy": policy,
        }),
    );
}

pub fn card_policy_updated(card_id: CardId, policy: &Policy) {
    emit(
        "card_policy_updated",
        &json!({ "card_id": card_id, "policy": policy }),
    );
}

pub fn card_status(event: &str, card_id: CardId) {
    emit(event, &json!({ "card_id": card_id }));
}

pub fn card_key_rotated(card_id: CardId, old: &PublicKey, new: &PublicKey) {
    emit(
        "card_key_rotated",
        &json!({ "card_id": card_id, "old_public_key": old, "new_public_key": new }),
    );
}

pub fn approver_set(account_id: &AccountId, max_amount: Option<U128>) {
    emit(
        "approver_set",
        &json!({ "account_id": account_id, "max_amount": max_amount }),
    );
}

pub fn deposit(token: &AccountId, sender_id: &AccountId, amount: U128) {
    emit(
        "deposit",
        &json!({ "token": token, "sender_id": sender_id, "amount": amount }),
    );
}

pub fn withdrawal(token: &AccountId, receiver_id: &AccountId, amount: U128, success: bool) {
    emit(
        "withdrawal",
        &json!({
            "token": token,
            "receiver_id": receiver_id,
            "amount": amount,
            "success": success,
        }),
    );
}

pub fn payment_submitted(payment: &Payment) {
    emit(
        "payment_submitted",
        &json!({
            "payment_id": payment.id,
            "card_id": payment.card_id,
            "merchant": payment.merchant,
            "token": payment.token,
            "amount": payment.amount,
            "memo": payment.memo,
            "reference": payment.reference,
        }),
    );
}

pub fn payment_queued(payment: &Payment, cause: QueueCause) {
    emit(
        "payment_queued",
        &json!({
            "payment_id": payment.id,
            "card_id": payment.card_id,
            "merchant": payment.merchant,
            "token": payment.token,
            "amount": payment.amount,
            "memo": payment.memo,
            "reference": payment.reference,
            "cause": cause,
        }),
    );
}

pub fn payment_decided(event: &str, payment_id: PaymentId, approver_id: &AccountId) {
    emit(
        event,
        &json!({ "payment_id": payment_id, "approver_id": approver_id }),
    );
}

pub fn payment_expired(payment_id: PaymentId) {
    emit("payment_expired", &json!({ "payment_id": payment_id }));
}

pub fn payment_settled(payment: &Payment) {
    emit(
        "payment_settled",
        &json!({
            "payment_id": payment.id,
            "card_id": payment.card_id,
            "merchant": payment.merchant,
            "token": payment.token,
            "amount": payment.amount,
            "reference": payment.reference,
        }),
    );
}

pub fn payment_failed(payment: &Payment, cause: FailureCause) {
    emit(
        "payment_failed",
        &json!({
            "payment_id": payment.id,
            "card_id": payment.card_id,
            "merchant": payment.merchant,
            "token": payment.token,
            "amount": payment.amount,
            "cause": cause,
        }),
    );
}

pub struct Rejection<'a> {
    pub card_id: CardId,
    pub merchant: &'a AccountId,
    pub token: &'a AccountId,
    pub amount: U128,
    pub reason: RejectReason,
    pub reference: Option<&'a str>,
}

pub fn payment_rejected(rejection: &Rejection<'_>) {
    emit(
        "payment_rejected",
        &json!({
            "card_id": rejection.card_id,
            "merchant": rejection.merchant,
            "token": rejection.token,
            "amount": rejection.amount,
            "reason": rejection.reason,
            "reference": rejection.reference,
        }),
    );
}

pub fn owner_event(event: &str, owner_id: &AccountId) {
    emit(event, &json!({ "owner_id": owner_id }));
}

#[cfg(test)]
mod tests {
    use near_sdk::json_types::U64;
    use near_sdk::serde_json;
    use near_sdk::test_utils::{VMContextBuilder, get_logs};
    use near_sdk::testing_env;

    use super::*;
    use crate::types::{MerchantRule, PaymentStatus, RiskMode};

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
        card_key_rotated(1, &key, &new_key);
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
}
