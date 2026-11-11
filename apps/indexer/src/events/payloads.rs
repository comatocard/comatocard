//! Typed payloads of every Comatocard event. Field types come from the contract crates, so a
//! payload the contracts cannot emit does not parse.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, PublicKey};
use serde::Deserialize;
use serde_json::Value;
use vault::types::{CardKind, FailureCause, QueueCause, RejectReason};

macro_rules! payloads {
    ($($name:ident { $($field:ident : $ty:ty),* $(,)? })*) => {
        $(
            #[derive(Debug, Clone, Deserialize)]
            #[serde(deny_unknown_fields)]
            pub struct $name { $(pub $field: $ty),* }
        )*
    };
}

payloads! {
    VaultCodePublished { code_hash: String, code_version: u64 }
    VaultCreated { vault_id: AccountId, owner_id: AccountId, code_version: u64 }
    CardCreated { card_id: u64, public_key: PublicKey, label: String, kind: CardKind, policy: Value }
    CardPolicyUpdated { card_id: u64, policy: Value }
    CardRef { card_id: u64 }
    CardKeyRotated { card_id: u64, old_public_key: Option<PublicKey>, new_public_key: PublicKey }
    CardTransferred { card_id: u64, old_holder: AccountId, new_holder: AccountId }
    CardKeyRejected { card_id: u64, public_key: PublicKey }
    ApproverSet { account_id: AccountId, max_amount: Option<U128> }
    Deposit { token: AccountId, sender_id: AccountId, amount: U128 }
    Withdrawal { token: AccountId, receiver_id: AccountId, amount: U128, success: bool }
    PaymentSubmitted {
        payment_id: u64, card_id: u64, merchant: AccountId, token: AccountId, amount: U128,
        memo: Option<String>, reference: Option<String>,
    }
    PaymentQueued {
        payment_id: u64, card_id: u64, merchant: AccountId, token: AccountId, amount: U128,
        memo: Option<String>, reference: Option<String>, cause: QueueCause,
    }
    PaymentDecision { payment_id: u64, approver_id: AccountId }
    PaymentRef { payment_id: u64 }
    PaymentSettled {
        payment_id: u64, card_id: u64, merchant: AccountId, token: AccountId, amount: U128,
        reference: Option<String>,
    }
    PaymentFailed {
        payment_id: u64, card_id: u64, merchant: AccountId, token: AccountId, amount: U128,
        cause: FailureCause,
    }
    PaymentRejected {
        card_id: u64, merchant: AccountId, token: AccountId, amount: U128, reason: RejectReason,
        reference: Option<String>,
    }
    OwnerRef { owner_id: AccountId }
    ReportSubmitted {
        report_id: u64, account_id: AccountId, reporter_id: AccountId,
        category: registry::Category, evidence_uri: String,
    }
    StatusChanged {
        account_id: AccountId, status: registry::Status, curator_id: AccountId,
        report_ids: Vec<u64>,
    }
}

/// A validated event payload.
#[derive(Debug, Clone)]
pub enum EventData {
    VaultCodePublished(VaultCodePublished),
    VaultCreated(VaultCreated),
    CardCreated(CardCreated),
    CardPolicyUpdated(CardPolicyUpdated),
    CardFrozen(CardRef),
    CardUnfrozen(CardRef),
    CardRevoked(CardRef),
    CardKeyRotated(CardKeyRotated),
    CardTransferred(CardTransferred),
    CardKeyRejected(CardKeyRejected),
    ApproverSet(ApproverSet),
    Deposit(Deposit),
    Withdrawal(Withdrawal),
    PaymentSubmitted(PaymentSubmitted),
    PaymentQueued(PaymentQueued),
    PaymentApproved(PaymentDecision),
    PaymentDeclined(PaymentDecision),
    PaymentExpired(PaymentRef),
    PaymentSettled(PaymentSettled),
    PaymentFailed(PaymentFailed),
    PaymentRejected(PaymentRejected),
    OwnerProposed(OwnerRef),
    OwnerChanged(OwnerRef),
    ReportSubmitted(ReportSubmitted),
    StatusChanged(StatusChanged),
}

/// Every event name the indexer accepts, in `docs/specs/events.md` order.
pub const EVENT_NAMES: [&str; 25] = [
    "vault_code_published",
    "vault_created",
    "card_created",
    "card_policy_updated",
    "card_frozen",
    "card_unfrozen",
    "card_revoked",
    "card_key_rotated",
    "card_transferred",
    "card_key_rejected",
    "approver_set",
    "deposit",
    "withdrawal",
    "payment_submitted",
    "payment_queued",
    "payment_approved",
    "payment_declined",
    "payment_expired",
    "payment_settled",
    "payment_failed",
    "payment_rejected",
    "owner_proposed",
    "owner_changed",
    "report_submitted",
    "status_changed",
];
