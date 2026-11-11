//! Payload structs. Field order is the JSON order; the golden fixtures shared with the SDK pin it.

use near_sdk::json_types::U128;
use near_sdk::serde::Serialize;
use near_sdk::{AccountId, PublicKey};

use crate::types::{CardId, CardKind, FailureCause, PaymentId, Policy, QueueCause, RejectReason};

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct CardCreated<'a> {
    pub(super) card_id: CardId,
    pub(super) public_key: &'a PublicKey,
    pub(super) label: &'a str,
    pub(super) kind: CardKind,
    pub(super) policy: &'a Policy,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct CardPolicyUpdated<'a> {
    pub(super) card_id: CardId,
    pub(super) policy: &'a Policy,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct CardRef {
    pub(super) card_id: CardId,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct CardKeyRotated<'a> {
    pub(super) card_id: CardId,
    pub(super) old_public_key: Option<&'a PublicKey>,
    pub(super) new_public_key: &'a PublicKey,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct CardTransferred<'a> {
    pub(super) card_id: CardId,
    pub(super) old_holder: &'a AccountId,
    pub(super) new_holder: &'a AccountId,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct ApproverSet<'a> {
    pub(super) account_id: &'a AccountId,
    pub(super) max_amount: Option<U128>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct Deposit<'a> {
    pub(super) token: &'a AccountId,
    pub(super) sender_id: &'a AccountId,
    pub(super) amount: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct Withdrawal<'a> {
    pub(super) token: &'a AccountId,
    pub(super) receiver_id: &'a AccountId,
    pub(super) amount: U128,
    pub(super) success: bool,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct PaymentSubmitted<'a> {
    pub(super) payment_id: PaymentId,
    pub(super) card_id: CardId,
    pub(super) merchant: &'a AccountId,
    pub(super) token: &'a AccountId,
    pub(super) amount: U128,
    pub(super) memo: Option<&'a str>,
    pub(super) reference: Option<&'a str>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct PaymentQueued<'a> {
    pub(super) payment_id: PaymentId,
    pub(super) card_id: CardId,
    pub(super) merchant: &'a AccountId,
    pub(super) token: &'a AccountId,
    pub(super) amount: U128,
    pub(super) memo: Option<&'a str>,
    pub(super) reference: Option<&'a str>,
    pub(super) cause: QueueCause,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct PaymentDecided<'a> {
    pub(super) payment_id: PaymentId,
    pub(super) approver_id: &'a AccountId,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct PaymentRef {
    pub(super) payment_id: PaymentId,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct PaymentSettled<'a> {
    pub(super) payment_id: PaymentId,
    pub(super) card_id: CardId,
    pub(super) merchant: &'a AccountId,
    pub(super) token: &'a AccountId,
    pub(super) amount: U128,
    pub(super) reference: Option<&'a str>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct PaymentFailed<'a> {
    pub(super) payment_id: PaymentId,
    pub(super) card_id: CardId,
    pub(super) merchant: &'a AccountId,
    pub(super) token: &'a AccountId,
    pub(super) amount: U128,
    pub(super) cause: FailureCause,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct OwnerRef<'a> {
    pub(super) owner_id: &'a AccountId,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(super) struct CardKeyRejected<'a> {
    pub(super) card_id: CardId,
    pub(super) public_key: &'a PublicKey,
}

/// A recorded rejection; serialized as the `payment_rejected` payload.
#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Rejection<'a> {
    pub card_id: CardId,
    pub merchant: &'a AccountId,
    pub token: &'a AccountId,
    pub amount: U128,
    pub reason: RejectReason,
    pub reference: Option<&'a str>,
}
