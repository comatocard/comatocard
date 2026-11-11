//! The payment path. `pay` evaluates the card policy and reserves funds and spend synchronously
//! before any cross-contract call; the submodules handle approvals, settlement and the per-card
//! approval queue, and release the reservation when a payment fails, is declined or expires, so
//! concurrent payments can never overspend.

mod approvals;
mod queue;
mod settlement;

use near_sdk::json_types::U128;
use near_sdk::{AccountId, env, near, require};

use crate::policy::{self, Context, Verdict};
use crate::types::{
    CardId, MAX_MEMO_LEN, MAX_QUEUED_PER_CARD, MAX_REFERENCE_LEN, Payment, PaymentDecision,
    PaymentStatus, RejectReason,
};
use crate::{MIN_PAYMENT_GAS, Vault, VaultExt, events, events::Rejection};

/// What a card asked to pay, before it is reserved.
struct PaymentRequest {
    merchant: AccountId,
    token: AccountId,
    amount: U128,
    memo: Option<String>,
    reference: Option<String>,
}

#[near]
impl Vault {
    /// Pays `merchant` from the card whose key signed this transaction.
    ///
    /// Only callable through a card key: the predecessor must be the vault itself and the signer
    /// key must belong to a card. Policy violations are recorded and returned, not reverted.
    pub fn pay(
        &mut self,
        merchant: AccountId,
        amount: U128,
        memo: Option<String>,
        reference: Option<String>,
    ) -> PaymentDecision {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "pay must be signed with a card key"
        );
        assert_payment_gas();
        require!(
            memo.as_ref().is_none_or(|m| m.len() <= MAX_MEMO_LEN),
            "memo is too long"
        );
        require!(
            reference
                .as_ref()
                .is_none_or(|r| r.len() <= MAX_REFERENCE_LEN),
            "reference is too long"
        );
        let card_id = self
            .card_keys
            .get(&env::signer_account_pk())
            .copied()
            .unwrap_or_else(|| env::panic_str("signer key is not a card"));
        let card = self
            .cards
            .get(&card_id)
            .unwrap_or_else(|| env::panic_str("card not found"));
        let token = card.policy.token.clone();
        let balance = self.balances.get(&token).copied().unwrap_or_default();
        let now = env::block_timestamp();
        let verdict = policy::evaluate(
            card,
            &merchant,
            amount.0,
            Context {
                now,
                token_accepted: balance.accepted,
                available: balance.available.0,
            },
        );
        let verdict = verdict.and_then(|verdict| match verdict {
            Verdict::Queue(_) if self.queue_len(card_id) >= MAX_QUEUED_PER_CARD => {
                Err(RejectReason::QueueFull)
            }
            other => Ok(other),
        });
        let verdict = match verdict {
            Ok(verdict) => verdict,
            Err(reason) => {
                events::payment_rejected(&Rejection {
                    card_id,
                    merchant: &merchant,
                    token: &token,
                    amount,
                    reason,
                    reference: reference.as_deref(),
                });
                return PaymentDecision::Rejected { reason };
            }
        };

        let payment = self.reserve(
            card_id,
            PaymentRequest {
                merchant,
                token,
                amount,
                memo,
                reference,
            },
            now,
        );
        let payment_id = payment.id;
        match verdict {
            Verdict::Queue(cause) => {
                self.queue(payment, cause);
                PaymentDecision::Queued { payment_id, cause }
            }
            Verdict::Execute => {
                events::payment_submitted(&payment);
                self.dispatch(payment, false);
                PaymentDecision::Submitted { payment_id }
            }
        }
    }
}

fn assert_payment_gas() {
    require!(
        env::prepaid_gas() >= MIN_PAYMENT_GAS,
        "attach at least 80 Tgas so the settlement callbacks cannot run out of gas"
    );
}

impl Vault {
    /// Reserves funds and spend for an accepted request and returns the payment to store.
    fn reserve(&mut self, card_id: CardId, request: PaymentRequest, now: u64) -> Payment {
        let PaymentRequest {
            merchant,
            token,
            amount,
            memo,
            reference,
        } = request;
        let balance = self.balance_mut(&token);
        balance.available = (balance.available.0 - amount.0).into();
        balance.reserved = (balance.reserved.0 + amount.0).into();
        let card = self.card_mut(card_id);
        card.spend = policy::add_spend(card.spend, amount.0, now);
        let id = self.next_payment_id;
        self.next_payment_id += 1;
        Payment {
            id,
            card_id,
            merchant,
            token,
            amount,
            memo,
            reference,
            status: PaymentStatus::Queued,
            queue_cause: None,
            approved_by: None,
            created_at: now.into(),
            day: policy::day_index(now),
            period: policy::period_index(now),
        }
    }
}
