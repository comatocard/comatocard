//! Decisions on queued payments: approve, decline, expire, and recovery of a stalled check.

use near_sdk::{AccountId, env, near, require};

use super::assert_payment_gas;
use crate::types::{CardStatus, FailureCause, Payment, PaymentId, PaymentStatus};
use crate::{Vault, VaultExt, events};

#[near]
impl Vault {
    /// Approves a queued payment. Callable by the owner or by an approver whose limit covers the
    /// amount, within the approval TTL. The card must still be active and inside its validity
    /// window, and the merchant must still be allowed.
    pub fn approve_payment(&mut self, payment_id: PaymentId) {
        assert_payment_gas();
        let approver = env::predecessor_account_id();
        let payment = self.queued_payment(payment_id);
        self.assert_can_decide(&approver, payment.amount.0);
        let card = self
            .cards
            .get(&payment.card_id)
            .unwrap_or_else(|| env::panic_str("card not found"));
        require!(
            card.status == CardStatus::Active,
            "card is not active, decline the payment instead"
        );
        let now = env::block_timestamp();
        require!(
            now < payment.created_at.0.saturating_add(self.approval_ttl),
            "approval time ran out, expire the payment instead"
        );
        let policy = &card.policy;
        require!(
            policy.valid_from.is_none_or(|from| now >= from.0)
                && policy.expires_at.is_none_or(|until| now < until.0),
            "card is outside its validity window, decline the payment instead"
        );
        require!(
            policy.merchants.permits(&payment.merchant),
            "merchant is no longer allowed, decline the payment instead"
        );
        let mut payment = payment;
        self.unqueue(&payment);
        payment.approved_by = Some(approver.clone());
        events::payment_decided("payment_approved", payment_id, &approver);
        self.dispatch(payment, true);
    }

    /// Declines a queued payment and releases its reservation.
    pub fn decline_payment(&mut self, payment_id: PaymentId) {
        let approver = env::predecessor_account_id();
        let payment = self.queued_payment(payment_id);
        self.assert_can_decide(&approver, payment.amount.0);
        self.unqueue(&payment);
        self.release(&payment);
        self.payments.remove(&payment_id);
        events::payment_decided("payment_declined", payment_id, &approver);
    }

    /// Closes a queued payment whose approval time ran out. Callable by anyone.
    pub fn expire_payment(&mut self, payment_id: PaymentId) {
        let payment = self.queued_payment(payment_id);
        require!(
            env::block_timestamp() >= payment.created_at.0.saturating_add(self.approval_ttl),
            "approval time has not run out yet"
        );
        self.unqueue(&payment);
        self.release(&payment);
        self.payments.remove(&payment_id);
        events::payment_expired(payment_id);
    }

    /// Releases a payment whose registry check never completed, once the approval TTL passed.
    /// Callable by anyone. No transfer was started, so the funds are free to return.
    pub fn recover_payment(&mut self, payment_id: PaymentId) {
        let payment = self
            .payments
            .get(&payment_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("payment not found"));
        require!(
            payment.status == PaymentStatus::Checking,
            "only a payment stuck in the registry check can be recovered"
        );
        require!(
            env::block_timestamp() >= payment.created_at.0.saturating_add(self.approval_ttl),
            "approval time has not run out yet"
        );
        self.fail(&payment, FailureCause::RegistryUnavailable);
    }
}

impl Vault {
    fn queued_payment(&self, payment_id: PaymentId) -> Payment {
        let payment = self
            .payments
            .get(&payment_id)
            .unwrap_or_else(|| env::panic_str("payment not found"));
        require!(
            payment.status == PaymentStatus::Queued,
            "payment is not waiting for approval"
        );
        payment.clone()
    }

    fn assert_can_decide(&self, account: &AccountId, amount: u128) {
        if *account == self.owner {
            return;
        }
        let limit = self
            .approvers
            .get(account)
            .copied()
            .unwrap_or_else(|| env::panic_str("only the owner or an approver may decide"));
        require!(amount <= limit, "amount exceeds the approver limit");
    }
}
