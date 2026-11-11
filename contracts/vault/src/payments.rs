//! The payment path: `pay`, the approval queue and the asynchronous settlement callbacks.
//!
//! Funds and spend are reserved synchronously before any cross-contract call and released when
//! a payment fails, is declined or expires, so concurrent payments can never overspend.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, NearToken, PromiseError, env, near, require};

use crate::ext::{ext_ft, ext_registry};
use crate::policy::{self, Context, Verdict};
use crate::types::{
    CardId, CardStatus, FailureCause, MAX_MEMO_LEN, MAX_QUEUED_PER_CARD, MAX_REFERENCE_LEN,
    Payment, PaymentDecision, PaymentId, PaymentStatus, QueueCause, RegistryStatus, RejectReason,
    RiskMode,
};
use crate::{
    GAS_CALLBACK, GAS_FT_TRANSFER, GAS_REGISTRY_CALLBACK, GAS_REGISTRY_CHECK, MIN_PAYMENT_GAS,
    Vault, VaultExt, events, events::Rejection,
};

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

        let payment = self.reserve(card_id, merchant, token, amount, memo, reference, now);
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

    /// Approves a queued payment. Callable by the owner or by an approver whose limit covers the
    /// amount. The card must still be active.
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

    #[private]
    pub fn on_registry_checked(
        &mut self,
        payment_id: PaymentId,
        approved: bool,
        #[callback_result] status: Result<RegistryStatus, PromiseError>,
    ) {
        let Some(payment) = self.payments.get(&payment_id).cloned() else {
            env::panic_str("payment not found");
        };
        match status {
            Err(_) => self.fail(&payment, FailureCause::RegistryUnavailable),
            Ok(RegistryStatus::Blocked) => self.fail(&payment, FailureCause::MerchantBlocked),
            Ok(RegistryStatus::Flagged)
                if !approved && self.risk_mode(&payment) == RiskMode::Strict =>
            {
                if self.queue_len(payment.card_id) >= MAX_QUEUED_PER_CARD {
                    self.fail(&payment, FailureCause::QueueFull);
                } else {
                    self.queue(payment, QueueCause::RiskFlagged);
                }
            }
            Ok(_) => self.transfer(payment),
        }
    }

    #[private]
    pub fn on_payment_transferred(
        &mut self,
        payment_id: PaymentId,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        let Some(payment) = self.payments.get(&payment_id).cloned() else {
            env::panic_str("payment not found");
        };
        if result.is_ok() {
            let balance = self.balance_mut(&payment.token);
            balance.reserved = balance.reserved.0.saturating_sub(payment.amount.0).into();
            self.payments.remove(&payment_id);
            events::payment_settled(&payment);
        } else {
            self.fail(&payment, FailureCause::TransferFailed);
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
    #[allow(clippy::too_many_arguments)]
    fn reserve(
        &mut self,
        card_id: crate::types::CardId,
        merchant: AccountId,
        token: AccountId,
        amount: U128,
        memo: Option<String>,
        reference: Option<String>,
        now: u64,
    ) -> Payment {
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

    /// Declines every queued payment of a card on behalf of `by`, for example when its token
    /// changes hands. Payments in the registry check or the transfer keep going.
    pub(crate) fn decline_queued(&mut self, card_id: CardId, by: &AccountId) {
        for payment_id in self.queued.remove(&card_id).unwrap_or_default() {
            if let Some(payment) = self.payments.remove(&payment_id) {
                self.release(&payment);
                events::payment_decided("payment_declined", payment_id, by);
            }
        }
    }

    fn queue_len(&self, card_id: CardId) -> usize {
        self.queued.get(&card_id).map_or(0, Vec::len)
    }

    fn unqueue(&mut self, payment: &Payment) {
        if let Some(ids) = self.queued.get_mut(&payment.card_id) {
            ids.retain(|id| *id != payment.id);
            if ids.is_empty() {
                self.queued.remove(&payment.card_id);
            }
        }
    }

    fn release(&mut self, payment: &Payment) {
        let balance = self.balance_mut(&payment.token);
        balance.reserved = balance.reserved.0.saturating_sub(payment.amount.0).into();
        balance.available = (balance.available.0 + payment.amount.0).into();
        if let Some(card) = self.cards.get_mut(&payment.card_id) {
            card.spend =
                policy::remove_spend(card.spend, payment.amount.0, payment.day, payment.period);
        }
    }

    fn queue(&mut self, mut payment: Payment, cause: QueueCause) {
        payment.status = PaymentStatus::Queued;
        payment.queue_cause = Some(cause);
        events::payment_queued(&payment, cause);
        self.queued
            .entry(payment.card_id)
            .or_default()
            .push(payment.id);
        self.payments.insert(payment.id, payment);
    }

    fn fail(&mut self, payment: &Payment, cause: FailureCause) {
        self.release(payment);
        self.payments.remove(&payment.id);
        events::payment_failed(payment, cause);
    }

    fn risk_mode(&self, payment: &Payment) -> RiskMode {
        self.cards
            .get(&payment.card_id)
            .map_or(RiskMode::Off, |card| card.policy.risk_mode)
    }

    /// Sends a reserved payment on: through the registry when the card asks for it, otherwise
    /// straight to the transfer.
    fn dispatch(&mut self, mut payment: Payment, approved: bool) {
        match (&self.registry, self.risk_mode(&payment)) {
            (Some(registry), RiskMode::BlockOnly | RiskMode::Strict) => {
                payment.status = PaymentStatus::Checking;
                let payment_id = payment.id;
                ext_registry::ext(registry.clone())
                    .with_static_gas(GAS_REGISTRY_CHECK)
                    .get_status(payment.merchant.clone())
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_REGISTRY_CALLBACK)
                            .on_registry_checked(payment_id, approved),
                    )
                    .detach();
                self.payments.insert(payment_id, payment);
            }
            _ => self.transfer(payment),
        }
    }

    fn transfer(&mut self, mut payment: Payment) {
        payment.status = PaymentStatus::Transferring;
        let payment_id = payment.id;
        ext_ft::ext(payment.token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(
                payment.merchant.clone(),
                payment.amount,
                payment.reference.clone(),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_payment_transferred(payment_id),
            )
            .detach();
        self.payments.insert(payment_id, payment);
    }

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
