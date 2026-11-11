//! The per-card approval queue, at most [`crate::types::MAX_QUEUED_PER_CARD`] payments long.

use near_sdk::AccountId;

use crate::types::{CardId, Payment, PaymentStatus, QueueCause};
use crate::{Vault, events};

impl Vault {
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

    pub(super) fn queue_len(&self, card_id: CardId) -> usize {
        self.queued.get(&card_id).map_or(0, Vec::len)
    }

    pub(super) fn unqueue(&mut self, payment: &Payment) {
        if let Some(ids) = self.queued.get_mut(&payment.card_id) {
            ids.retain(|id| *id != payment.id);
            if ids.is_empty() {
                self.queued.remove(&payment.card_id);
            }
        }
    }

    pub(super) fn queue(&mut self, mut payment: Payment, cause: QueueCause) {
        payment.status = PaymentStatus::Queued;
        payment.queue_cause = Some(cause);
        events::payment_queued(&payment, cause);
        self.queued
            .entry(payment.card_id)
            .or_default()
            .push(payment.id);
        self.payments.insert(payment.id, payment);
    }
}
