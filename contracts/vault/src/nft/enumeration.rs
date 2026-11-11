//! NEP-181 enumeration over the cards that are not revoked.

use near_contract_standards::non_fungible_token::Token;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

use crate::types::Card;
use crate::{Vault, VaultExt};

/// Page size cap for the enumeration views.
const MAX_PAGE: u64 = 100;

#[near]
impl NonFungibleTokenEnumeration for Vault {
    fn nft_total_supply(&self) -> U128 {
        U128(self.live_cards().count() as u128)
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.token_page(self.live_cards(), from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(self.cards_of(&account_id).count() as u128)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.token_page(self.cards_of(&account_id), from_index, limit)
    }
}

impl Vault {
    fn token_page<'a>(
        &'a self,
        cards: impl Iterator<Item = &'a Card>,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        let skip = usize::try_from(from_index.map_or(0, |index| index.0)).unwrap_or(usize::MAX);
        let take = usize::try_from(limit.unwrap_or(MAX_PAGE).min(MAX_PAGE)).unwrap_or(0);
        cards
            .skip(skip)
            .take(take)
            .map(|card| self.token(card))
            .collect()
    }
}
