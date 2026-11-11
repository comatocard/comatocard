//! Settlement: the registry check, the token transfer and their callbacks.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::{NearToken, PromiseError, env, near};

use crate::ext::ext_registry;
use crate::policy;
use crate::types::{
    FailureCause, MAX_QUEUED_PER_CARD, Payment, PaymentId, PaymentStatus, QueueCause,
    RegistryStatus, RiskMode,
};
use crate::{
    GAS_CALLBACK, GAS_FT_TRANSFER, GAS_REGISTRY_CALLBACK, GAS_REGISTRY_CHECK, Vault, VaultExt,
    events,
};

#[near]
impl Vault {
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

impl Vault {
    pub(super) fn release(&mut self, payment: &Payment) {
        let balance = self.balance_mut(&payment.token);
        balance.reserved = balance.reserved.0.saturating_sub(payment.amount.0).into();
        balance.available = (balance.available.0 + payment.amount.0).into();
        if let Some(card) = self.cards.get_mut(&payment.card_id) {
            card.spend =
                policy::remove_spend(card.spend, payment.amount.0, payment.day, payment.period);
        }
    }

    pub(super) fn fail(&mut self, payment: &Payment, cause: FailureCause) {
        self.release(payment);
        self.payments.remove(&payment.id);
        events::payment_failed(payment, cause);
    }

    pub(super) fn risk_mode(&self, payment: &Payment) -> RiskMode {
        self.cards
            .get(&payment.card_id)
            .map_or(RiskMode::Off, |card| card.policy.risk_mode)
    }

    /// Sends a reserved payment on: through the registry when the card asks for it, otherwise
    /// straight to the transfer. A card that asks for a check on a vault without a registry fails
    /// closed.
    pub(super) fn dispatch(&mut self, mut payment: Payment, approved: bool) {
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
            (None, RiskMode::BlockOnly | RiskMode::Strict) => {
                self.fail(&payment, FailureCause::RegistryUnavailable);
            }
            _ => self.transfer(payment),
        }
    }

    pub(super) fn transfer(&mut self, mut payment: Payment) {
        payment.status = PaymentStatus::Transferring;
        let payment_id = payment.id;
        ext_ft_core::ext(payment.token.clone())
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
}
