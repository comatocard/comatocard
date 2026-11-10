//! Read-only methods.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, PublicKey, env, near};

use crate::policy::{self, Context, Verdict};
use crate::types::{
    ApproverView, Card, CardId, Payment, PaymentId, PaymentPreview, TokenBalanceView, VaultConfig,
};
use crate::{CONTRACT_VERSION, Vault, VaultExt};

const MAX_PAGE: u32 = 100;

fn page<T>(iter: impl Iterator<Item = T>, from_index: Option<u32>, limit: Option<u32>) -> Vec<T> {
    iter.skip(from_index.unwrap_or(0) as usize)
        .take(limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as usize)
        .collect()
}

#[near]
impl Vault {
    pub fn get_config(&self) -> VaultConfig {
        VaultConfig {
            owner: self.owner.clone(),
            pending_owner: self.pending_owner.clone(),
            factory: self.factory.clone(),
            registry: self.registry.clone(),
            approval_ttl: self.approval_ttl.into(),
            contract_version: CONTRACT_VERSION.to_owned(),
        }
    }

    pub fn get_balances(&self) -> Vec<TokenBalanceView> {
        self.balances
            .iter()
            .map(|(token, balance)| TokenBalanceView {
                token: token.clone(),
                accepted: balance.accepted,
                available: balance.available,
                reserved: balance.reserved,
            })
            .collect()
    }

    /// Cards with spend counters normalized to the current windows.
    pub fn list_cards(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Card> {
        page(self.cards.values().map(normalized), from_index, limit)
    }

    pub fn get_card(&self, card_id: CardId) -> Option<Card> {
        self.cards.get(&card_id).map(normalized)
    }

    pub fn get_card_by_key(&self, public_key: PublicKey) -> Option<Card> {
        self.card_keys
            .get(&public_key)
            .and_then(|id| self.get_card(*id))
    }

    /// Payments that are queued or in flight. Settled, failed and closed payments live only in
    /// events.
    pub fn list_payments(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Payment> {
        page(self.payments.values().cloned(), from_index, limit)
    }

    pub fn get_payment(&self, payment_id: PaymentId) -> Option<Payment> {
        self.payments.get(&payment_id).cloned()
    }

    pub fn list_approvers(&self) -> Vec<ApproverView> {
        self.approvers
            .iter()
            .map(|(account_id, limit)| ApproverView {
                account_id: account_id.clone(),
                max_amount: U128(*limit),
            })
            .collect()
    }

    /// Dry run of the synchronous checks of `pay`, without the registry call.
    pub fn preview_payment(
        &self,
        public_key: PublicKey,
        merchant: AccountId,
        amount: U128,
    ) -> PaymentPreview {
        let Some(card) = self
            .card_keys
            .get(&public_key)
            .and_then(|id| self.cards.get(id))
        else {
            env::panic_str("public key is not a card");
        };
        let balance = self
            .balances
            .get(&card.policy.token)
            .copied()
            .unwrap_or_default();
        let ctx = Context {
            now: env::block_timestamp(),
            token_accepted: balance.accepted,
            available: balance.available.0,
        };
        match policy::evaluate(card, &merchant, amount.0, ctx) {
            Ok(Verdict::Execute) => PaymentPreview::Allowed,
            Ok(Verdict::Queue(cause)) => PaymentPreview::NeedsApproval { cause },
            Err(reason) => PaymentPreview::Rejected { reason },
        }
    }
}

/// Card with spend counters relative to the current windows.
fn normalized(card: &Card) -> Card {
    let now = env::block_timestamp();
    let (day_spent, period_spent) = policy::current_spend(card.spend, now);
    let mut view = card.clone();
    view.spend.day = policy::day_index(now);
    view.spend.day_spent = day_spent.into();
    view.spend.period = policy::period_index(now);
    view.spend.period_spent = period_spent.into();
    view
}
