//! Read-only methods.

use near_sdk::json_types::Base58CryptoHash;
use near_sdk::{AccountId, NearToken, near};

use crate::{Factory, FactoryExt, MIN_VAULT_DEPOSIT};

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FactoryConfig {
    pub owner: AccountId,
    pub vault_code_hash: Option<Base58CryptoHash>,
    pub code_version: u32,
    pub default_tokens: Vec<AccountId>,
    pub default_registry: Option<AccountId>,
    pub min_deposit: NearToken,
}

#[near]
impl Factory {
    pub fn get_config(&self) -> FactoryConfig {
        FactoryConfig {
            owner: self.owner.clone(),
            vault_code_hash: self.vault_code_hash.map(Base58CryptoHash::from),
            code_version: self.code_version,
            default_tokens: self.default_tokens.clone(),
            default_registry: self.default_registry.clone(),
            min_deposit: MIN_VAULT_DEPOSIT,
        }
    }
}
