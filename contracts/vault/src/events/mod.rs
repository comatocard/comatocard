//! Vault events. The schema is documented in `docs/specs/events.md`. Payloads are typed structs
//! whose field order is the JSON order; the golden fixtures shared with the SDK pin it.

mod payloads;

pub use payloads::Rejection;
use payloads::{
    ApproverSet, CardCreated, CardKeyRejected, CardKeyRotated, CardPolicyUpdated, CardRef,
    CardTransferred, Deposit, OwnerRef, PaymentDecided, PaymentFailed, PaymentQueued, PaymentRef,
    PaymentSettled, PaymentSubmitted, Withdrawal,
};

use comatocard_common::events::emit;
use near_contract_standards::non_fungible_token::events::{NftBurn, NftMint, NftTransfer};
use near_sdk::json_types::U128;
use near_sdk::{AccountId, PublicKey};

use crate::types::{CardId, CardKind, FailureCause, Payment, PaymentId, Policy, QueueCause};

pub fn card_created(
    card_id: CardId,
    public_key: &PublicKey,
    label: &str,
    kind: CardKind,
    policy: &Policy,
) {
    emit(
        "card_created",
        &CardCreated {
            card_id,
            public_key,
            label,
            kind,
            policy,
        },
    );
}

pub fn card_policy_updated(card_id: CardId, policy: &Policy) {
    emit(
        "card_policy_updated",
        &CardPolicyUpdated { card_id, policy },
    );
}

pub fn card_status(event: &str, card_id: CardId) {
    emit(event, &CardRef { card_id });
}

pub fn card_key_rotated(card_id: CardId, old: Option<&PublicKey>, new: &PublicKey) {
    emit(
        "card_key_rotated",
        &CardKeyRotated {
            card_id,
            old_public_key: old,
            new_public_key: new,
        },
    );
}

/// Records a token transfer in the Comatocard standard and as NEP-171 `nft_transfer`.
pub fn card_transferred(
    card_id: CardId,
    old_holder: &AccountId,
    new_holder: &AccountId,
    memo: Option<&str>,
) {
    emit(
        "card_transferred",
        &CardTransferred {
            card_id,
            old_holder,
            new_holder,
        },
    );
    let token_id = card_id.to_string();
    NftTransfer {
        old_owner_id: old_holder,
        new_owner_id: new_holder,
        token_ids: &[&token_id],
        authorized_id: None,
        memo,
    }
    .emit();
}

/// NEP-171 `nft_mint` for a new card.
pub fn card_minted(card_id: CardId, owner_id: &AccountId) {
    let token_id = card_id.to_string();
    NftMint {
        owner_id,
        token_ids: &[&token_id],
        memo: None,
    }
    .emit();
}

/// NEP-171 `nft_burn` for a revoked card.
pub fn card_burned(card_id: CardId, owner_id: &AccountId) {
    let token_id = card_id.to_string();
    NftBurn {
        owner_id,
        token_ids: &[&token_id],
        authorized_id: None,
        memo: None,
    }
    .emit();
}

/// `AddKey` failed for a card key, so the card has no key until a new one is set.
pub fn card_key_rejected(card_id: CardId, public_key: &PublicKey) {
    emit(
        "card_key_rejected",
        &CardKeyRejected {
            card_id,
            public_key,
        },
    );
}

pub fn approver_set(account_id: &AccountId, max_amount: Option<U128>) {
    emit(
        "approver_set",
        &ApproverSet {
            account_id,
            max_amount,
        },
    );
}

pub fn deposit(token: &AccountId, sender_id: &AccountId, amount: U128) {
    emit(
        "deposit",
        &Deposit {
            token,
            sender_id,
            amount,
        },
    );
}

pub fn withdrawal(token: &AccountId, receiver_id: &AccountId, amount: U128, success: bool) {
    emit(
        "withdrawal",
        &Withdrawal {
            token,
            receiver_id,
            amount,
            success,
        },
    );
}

pub fn payment_submitted(payment: &Payment) {
    emit(
        "payment_submitted",
        &PaymentSubmitted {
            payment_id: payment.id,
            card_id: payment.card_id,
            merchant: &payment.merchant,
            token: &payment.token,
            amount: payment.amount,
            memo: payment.memo.as_deref(),
            reference: payment.reference.as_deref(),
        },
    );
}

pub fn payment_queued(payment: &Payment, cause: QueueCause) {
    emit(
        "payment_queued",
        &PaymentQueued {
            payment_id: payment.id,
            card_id: payment.card_id,
            merchant: &payment.merchant,
            token: &payment.token,
            amount: payment.amount,
            memo: payment.memo.as_deref(),
            reference: payment.reference.as_deref(),
            cause,
        },
    );
}

pub fn payment_decided(event: &str, payment_id: PaymentId, approver_id: &AccountId) {
    emit(
        event,
        &PaymentDecided {
            payment_id,
            approver_id,
        },
    );
}

pub fn payment_expired(payment_id: PaymentId) {
    emit("payment_expired", &PaymentRef { payment_id });
}

pub fn payment_settled(payment: &Payment) {
    emit(
        "payment_settled",
        &PaymentSettled {
            payment_id: payment.id,
            card_id: payment.card_id,
            merchant: &payment.merchant,
            token: &payment.token,
            amount: payment.amount,
            reference: payment.reference.as_deref(),
        },
    );
}

pub fn payment_failed(payment: &Payment, cause: FailureCause) {
    emit(
        "payment_failed",
        &PaymentFailed {
            payment_id: payment.id,
            card_id: payment.card_id,
            merchant: &payment.merchant,
            token: &payment.token,
            amount: payment.amount,
            cause,
        },
    );
}

pub fn payment_rejected(rejection: &Rejection<'_>) {
    emit("payment_rejected", rejection);
}

pub fn owner_event(event: &str, owner_id: &AccountId) {
    emit(event, &OwnerRef { owner_id });
}

#[cfg(test)]
mod tests;
