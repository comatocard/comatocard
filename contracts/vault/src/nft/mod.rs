//! Cards as NEP-171 tokens, built on the traits and types of `near-contract-standards` over the
//! vault's own card storage. The token id is the card id. Holding the token grants two rights:
//! transferring it and setting the card key. Policy, freeze and revoke stay with the vault owner.
//! Approvals (NEP-178) are not offered.
//!
//! - [`core`]: NEP-171 transfers and the resolver of `nft_transfer_call`.
//! - [`metadata`]: NEP-177 contract and token metadata.
//! - [`enumeration`]: NEP-181 views.

mod core;
mod enumeration;
mod metadata;

use near_sdk::{AccountId, NearToken, PublicKey, env, near, require};

use crate::types::{Card, CardId, CardStatus};
use crate::{Vault, VaultExt, events};

/// Smallest deposit a holder attaches to `set_card_key`. The deposit becomes the gas allowance of
/// the key, so a holder funds its own payments instead of the vault. It equals the default card
/// allowance because the protocol checks the allowance against a pessimistic gas price.
pub const MIN_HOLDER_ALLOWANCE: NearToken = crate::DEFAULT_CARD_ALLOWANCE;

fn card_id(token_id: &str) -> CardId {
    token_id
        .parse()
        .unwrap_or_else(|_| env::panic_str("token not found"))
}

#[near]
impl Vault {
    /// Sets the key of a card held by the caller and deletes the previous key. The attached
    /// deposit, at least [`MIN_HOLDER_ALLOWANCE`], becomes the gas allowance of the new key.
    #[payable]
    pub fn set_card_key(&mut self, card_id: CardId, public_key: PublicKey) {
        let deposit = env::attached_deposit();
        require!(
            deposit >= MIN_HOLDER_ALLOWANCE,
            "attach at least 1 NEAR as the key allowance"
        );
        let holder = self
            .cards
            .get(&card_id)
            .unwrap_or_else(|| env::panic_str("card not found"))
            .holder
            .as_ref();
        require!(
            holder == Some(&env::predecessor_account_id()),
            "only the card holder may set the key"
        );
        self.replace_card_key(card_id, public_key, deposit);
    }
}

// ponytail: enumeration scans every card, fine for the tens of cards a vault holds; keep a
// per-holder index if vaults grow to thousands of cards.
impl Vault {
    /// Moves a card to `receiver_id` on behalf of its holder and returns the previous holder.
    fn transfer_card(
        &mut self,
        receiver_id: &AccountId,
        token_id: &str,
        approval_id: Option<u64>,
        memo: Option<&str>,
    ) -> AccountId {
        require!(approval_id.is_none(), "approvals are not supported");
        let id = card_id(token_id);
        let holder = self.live_card(id).map_or_else(
            || env::panic_str("token not found"),
            |card| self.holder(card),
        );
        require!(
            env::predecessor_account_id() == holder,
            "only the card holder may transfer the card"
        );
        require!(*receiver_id != holder, "receiver already holds the card");
        self.hand_over(id, &holder, receiver_id, memo);
        holder
    }

    /// Moves a card from `from` to `to`: deletes the card key, declines the queued payments of
    /// the card and records the new holder. The owner is stored as `None` so the card follows
    /// future ownership changes.
    fn hand_over(&mut self, card_id: CardId, from: &AccountId, to: &AccountId, memo: Option<&str>) {
        let holder = (*to != self.owner).then(|| to.clone());
        let card = self.card_mut(card_id);
        card.holder = holder;
        if let Some(key) = card.public_key.take() {
            self.card_keys.remove(&key);
            crate::cards::delete_card_key(key);
        }
        self.decline_queued(card_id, from);
        events::card_transferred(card_id, from, to, memo);
    }

    fn holder(&self, card: &Card) -> AccountId {
        card.holder.clone().unwrap_or_else(|| self.owner.clone())
    }

    fn live_card(&self, card_id: CardId) -> Option<&Card> {
        self.cards
            .get(&card_id)
            .filter(|card| card.status != CardStatus::Revoked)
    }

    fn live_cards(&self) -> impl Iterator<Item = &Card> {
        self.cards
            .values()
            .filter(|card| card.status != CardStatus::Revoked)
    }

    fn cards_of<'a>(&'a self, account_id: &'a AccountId) -> impl Iterator<Item = &'a Card> {
        self.live_cards()
            .filter(move |card| card.holder.as_ref().unwrap_or(&self.owner) == account_id)
    }
}
