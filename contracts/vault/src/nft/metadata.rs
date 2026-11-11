//! NEP-177 metadata of the vault and of each card token.

use std::collections::HashMap;

use near_contract_standards::non_fungible_token::Token;
use near_contract_standards::non_fungible_token::metadata::{
    NFT_METADATA_SPEC, NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata,
};
use near_sdk::{env, near};

use crate::types::Card;
use crate::{Vault, VaultExt};

/// NEP-177 timestamps are Unix epoch milliseconds as strings.
fn millis(nanoseconds: u64) -> String {
    (nanoseconds / 1_000_000).to_string()
}

#[near]
impl NonFungibleTokenMetadataProvider for Vault {
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_owned(),
            name: format!("Comatocard cards of {}", env::current_account_id()),
            symbol: "CARD".to_owned(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}

impl Vault {
    pub(super) fn token(&self, card: &Card) -> Token {
        Token {
            token_id: card.id.to_string(),
            owner_id: self.holder(card),
            metadata: Some(TokenMetadata {
                title: Some(card.label.clone()),
                description: Some(format!(
                    "Comatocard {} card spending {} under an on-chain policy",
                    card.kind.as_str(),
                    card.policy.token
                )),
                media: None,
                media_hash: None,
                copies: Some(1),
                issued_at: Some(millis(card.created_at.0)),
                expires_at: card.policy.expires_at.map(|at| millis(at.0)),
                starts_at: card.policy.valid_from.map(|at| millis(at.0)),
                updated_at: None,
                extra: None,
                reference: None,
                reference_hash: None,
            }),
            approved_account_ids: Some(HashMap::new()),
        }
    }
}
