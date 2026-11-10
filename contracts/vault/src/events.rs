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
    use near_sdk::serde_json;

    use super::*;

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
