//! Comatocard factory.
//!
//! The owner publishes the vault wasm once as a global contract (NEP-591, by code hash). Anyone
//! then creates a vault `<name>.<factory>` that uses that code, for well under 0.001 NEAR of code
//! storage. Vaults keep the code hash they were created with; publishing new code only affects
//! vaults created afterwards.

mod code;
mod events;
mod vaults;
mod views;

pub use views::FactoryConfig;

use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, CryptoHash, Gas, NearToken, PanicOnDefault, env, near, require,
};

/// Smallest deposit that creates a vault. It funds the vault account storage and the gas that
/// card keys spend from the vault balance; owners are encouraged to attach more.
pub const MIN_VAULT_DEPOSIT: NearToken = NearToken::from_millinear(500);

/// Maximum number of vaults listed per owner.
pub const MAX_VAULTS_PER_OWNER: usize = 20;

const GAS_VAULT_INIT: Gas = Gas::from_tgas(30);
const GAS_ON_CREATED: Gas = Gas::from_tgas(15);

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    VaultsByOwner,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Factory {
    owner: AccountId,
    vault_code_hash: Option<CryptoHash>,
    code_version: u32,
    default_tokens: Vec<AccountId>,
    default_registry: Option<AccountId>,
    vaults_by_owner: LookupMap<AccountId, Vec<AccountId>>,
}

#[near]
impl Factory {
    #[init]
    pub fn new(
        owner: AccountId,
        default_tokens: Vec<AccountId>,
        default_registry: Option<AccountId>,
    ) -> Self {
        Self {
            owner,
            vault_code_hash: None,
            code_version: 0,
            default_tokens,
            default_registry,
            vaults_by_owner: LookupMap::new(StorageKey::VaultsByOwner),
        }
    }
}

impl Factory {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner may call this method"
        );
    }
}

#[cfg(test)]
mod tests;
