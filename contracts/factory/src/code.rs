//! Vault code: the owner publishes it as a global contract and sets the vault defaults.

use comatocard_common::events::emit;
use near_sdk::json_types::Base58CryptoHash;
use near_sdk::{AccountId, CryptoHash, Promise, env, near, require};

use crate::events::CodePublished;
use crate::{Factory, FactoryExt};

#[near]
impl Factory {
    /// Publishes the vault wasm, passed as the raw call input, as a global contract by hash.
    /// The publishing cost is burned from the factory balance.
    pub fn publish_vault_code(&mut self) -> Base58CryptoHash {
        self.assert_owner();
        let code = env::input().unwrap_or_else(|| env::panic_str("vault code is required"));
        require!(!code.is_empty(), "vault code is required");
        let hash: CryptoHash = env::sha256_array(&code);
        Promise::new(env::current_account_id())
            .deploy_global_contract(code)
            .detach();
        self.vault_code_hash = Some(hash);
        self.code_version += 1;
        let encoded = Base58CryptoHash::from(hash);
        emit(
            "vault_code_published",
            &CodePublished {
                code_hash: encoded,
                code_version: self.code_version,
            },
        );
        encoded
    }

    pub fn set_defaults(
        &mut self,
        default_tokens: Vec<AccountId>,
        default_registry: Option<AccountId>,
    ) {
        self.assert_owner();
        self.default_tokens = default_tokens;
        self.default_registry = default_registry;
    }
}
