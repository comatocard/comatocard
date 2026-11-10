//! Cards as NEP-171 tokens (core, NEP-177 metadata, NEP-181 enumeration). The token id is the card
//! id. Holding the token grants two rights: transferring it and setting the card key. Policy,
//! freeze and revoke stay with the vault owner. `nft_transfer_call` and approvals are not offered.

use std::collections::HashMap;

use near_sdk::json_types::U128;
use near_sdk::{AccountId, NearToken, PublicKey, assert_one_yocto, env, near, require};

use crate::types::{Card, CardId, CardStatus};
use crate::{Vault, VaultExt, events};

/// Smallest deposit a holder attaches to `set_card_key`. The deposit becomes the gas allowance of
/// the key, so a holder funds its own payments instead of the vault. It equals the default card
/// allowance because the protocol checks the allowance against a pessimistic gas price.
pub const MIN_HOLDER_ALLOWANCE: NearToken = crate::DEFAULT_CARD_ALLOWANCE;

const MAX_PAGE: u32 = 100;

#[near(serializers = [json])]
pub struct TokenMetadata {
    pub title: String,
    pub description: String,
    pub issued_at: String,
    pub expires_at: Option<String>,
}

#[near(serializers = [json])]
#[expect(
    clippy::struct_field_names,
    reason = "field names are fixed by NEP-171"
)]
pub struct Token {
    pub token_id: String,
    pub owner_id: AccountId,
    pub metadata: TokenMetadata,
    pub approved_account_ids: HashMap<AccountId, u64>,
}

#[near(serializers = [json])]
pub struct ContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

fn card_id(token_id: &str) -> CardId {
    token_id
        .parse()
        .unwrap_or_else(|_| env::panic_str("token not found"))
}

fn millis(nanoseconds: u64) -> String {
    (nanoseconds / 1_000_000).to_string()
}

#[near]
impl Vault {
    /// Moves the card token to `receiver_id` and deletes the card key, so the previous holder
    /// can no longer pay. The card is unusable until the new holder calls `set_card_key`.
    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approval_id.is_none(), "approvals are not supported");
        let _ = memo;
        let id = card_id(&token_id);
        let holder = self.holder_of(id);
        require!(
            env::predecessor_account_id() == holder,
            "only the card holder may transfer the card"
        );
        require!(receiver_id != holder, "receiver already holds the card");
        let owner = self.owner.clone();
        let card = self.card_mut(id);
        card.holder = (receiver_id != owner).then(|| receiver_id.clone());
        let old_key = card.public_key.take();
        if let Some(key) = old_key {
            self.card_keys.remove(&key);
            crate::cards::delete_card_key(key);
        }
        events::card_transferred(id, &holder, &receiver_id);
    }

    /// Sets the key of a card held by the caller and deletes the previous key. The attached
    /// deposit, at least [`MIN_HOLDER_ALLOWANCE`], becomes the gas allowance of the new key.
    #[payable]
    pub fn set_card_key(&mut self, card_id: CardId, public_key: PublicKey) {
        let deposit = env::attached_deposit();
        require!(
            deposit >= MIN_HOLDER_ALLOWANCE,
            "attach at least 1 NEAR as the key allowance"
        );
        let holder = self.card_ref(card_id).holder.clone();
        require!(
            holder.as_ref() == Some(&env::predecessor_account_id()),
            "only the card holder may set the key"
        );
        self.replace_card_key(card_id, public_key, deposit);
    }

    pub fn nft_token(&self, token_id: String) -> Option<Token> {
        let id = token_id.parse().ok()?;
        self.cards
            .get(&id)
            .filter(|card| card.status != CardStatus::Revoked)
            .map(|card| self.token(card))
    }

    pub fn nft_metadata(&self) -> ContractMetadata {
        ContractMetadata {
            spec: "nft-1.0.0".to_owned(),
            name: format!("Comatocard cards of {}", env::current_account_id()),
            symbol: "CARD".to_owned(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }

    pub fn nft_total_supply(&self) -> U128 {
        U128(self.live_cards().count() as u128)
    }

    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u32>) -> Vec<Token> {
        self.token_page(self.live_cards(), from_index, limit)
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(self.cards_of(&account_id).count() as u128)
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u32>,
    ) -> Vec<Token> {
        self.token_page(self.cards_of(&account_id), from_index, limit)
    }
}

// ponytail: enumeration scans every card, fine for the tens of cards a vault holds; keep a
// per-holder index if vaults grow to thousands of cards.
impl Vault {
    fn card_ref(&self, card_id: CardId) -> &Card {
        self.cards
            .get(&card_id)
            .unwrap_or_else(|| env::panic_str("card not found"))
    }

    /// Holder of a card that is not revoked.
    fn holder_of(&self, card_id: CardId) -> AccountId {
        let card = self
            .cards
            .get(&card_id)
            .filter(|card| card.status != CardStatus::Revoked)
            .unwrap_or_else(|| env::panic_str("token not found"));
        card.holder.clone().unwrap_or_else(|| self.owner.clone())
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

    fn token_page<'a>(
        &'a self,
        cards: impl Iterator<Item = &'a Card>,
        from_index: Option<U128>,
        limit: Option<u32>,
    ) -> Vec<Token> {
        let skip = usize::try_from(from_index.map_or(0, |index| index.0)).unwrap_or(usize::MAX);
        cards
            .skip(skip)
            .take(limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as usize)
            .map(|card| self.token(card))
            .collect()
    }

    fn token(&self, card: &Card) -> Token {
        Token {
            token_id: card.id.to_string(),
            owner_id: card.holder.clone().unwrap_or_else(|| self.owner.clone()),
            metadata: TokenMetadata {
                title: card.label.clone(),
                description: format!(
                    "Comatocard {:?} card spending {} under an on-chain policy",
                    card.kind, card.policy.token
                )
                .to_lowercase(),
                issued_at: millis(card.created_at.0),
                expires_at: card.policy.expires_at.map(|at| millis(at.0)),
            },
            approved_account_ids: HashMap::new(),
        }
    }
}
