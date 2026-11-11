//! Vault creation from the published code, with a refund when creation fails.

use comatocard_common::events::emit;
use near_sdk::json_types::U64;
use near_sdk::serde::Serialize;
use near_sdk::serde_json;
use near_sdk::{AccountId, NearToken, Promise, PromiseError, env, near, require};

use crate::events::VaultCreated;
use crate::{
    Factory, FactoryExt, GAS_ON_CREATED, GAS_VAULT_INIT, MAX_VAULTS_PER_OWNER, MIN_VAULT_DEPOSIT,
};

/// Arguments of the vault `new` method.
#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct VaultInit<'a> {
    owner: &'a AccountId,
    accepted_tokens: Vec<AccountId>,
    registry: Option<AccountId>,
    approval_ttl: Option<U64>,
}

#[near]
impl Factory {
    /// Creates `<name>.<factory>` with the published vault code and initializes it for `owner`
    /// (the caller by default). Tokens and registry fall back to the factory defaults. The whole
    /// deposit becomes the vault balance; it is refunded if creation fails.
    #[payable]
    pub fn create_vault(
        &mut self,
        name: String,
        owner: Option<AccountId>,
        accepted_tokens: Option<Vec<AccountId>>,
        registry: Option<AccountId>,
        approval_ttl: Option<U64>,
    ) -> Promise {
        let code_hash = self
            .vault_code_hash
            .unwrap_or_else(|| env::panic_str("vault code is not published yet"));
        let deposit = env::attached_deposit();
        require!(
            deposit >= MIN_VAULT_DEPOSIT,
            format!("attach at least {MIN_VAULT_DEPOSIT}")
        );
        require!(
            !name.is_empty() && !name.contains('.'),
            "name must be a single account label"
        );
        let vault_id: AccountId = format!("{name}.{}", env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str("name is not a valid account label"));
        let caller = env::predecessor_account_id();
        let owner = owner.unwrap_or_else(|| caller.clone());
        let listed = self.vaults_by_owner.get(&owner).map_or(0, Vec::len);
        require!(
            listed < MAX_VAULTS_PER_OWNER,
            "owner has the maximum number of vaults"
        );
        let init_args = serde_json::to_vec(&VaultInit {
            owner: &owner,
            accepted_tokens: accepted_tokens.unwrap_or_else(|| self.default_tokens.clone()),
            registry: registry.or_else(|| self.default_registry.clone()),
            approval_ttl,
        })
        .unwrap_or_else(|_| env::panic_str("cannot encode vault init arguments"));

        Promise::new(vault_id.clone())
            .create_account()
            .transfer(deposit)
            .use_global_contract(code_hash)
            .function_call(
                "new".to_owned(),
                init_args,
                NearToken::from_yoctonear(0),
                GAS_VAULT_INIT,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_CREATED)
                    .on_vault_created(vault_id, owner, caller, deposit, self.code_version),
            )
    }

    #[private]
    pub fn on_vault_created(
        &mut self,
        vault_id: AccountId,
        owner: AccountId,
        caller: AccountId,
        deposit: NearToken,
        code_version: u32,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> Option<AccountId> {
        if result.is_err() {
            Promise::new(caller).transfer(deposit).detach();
            return None;
        }
        let mut vaults = self
            .vaults_by_owner
            .get(&owner)
            .cloned()
            .unwrap_or_default();
        vaults.push(vault_id.clone());
        self.vaults_by_owner.insert(owner.clone(), vaults);
        emit(
            "vault_created",
            &VaultCreated {
                vault_id: &vault_id,
                owner_id: &owner,
                code_version,
            },
        );
        Some(vault_id)
    }

    pub fn list_vaults(&self, owner: AccountId) -> Vec<AccountId> {
        self.vaults_by_owner
            .get(&owner)
            .cloned()
            .unwrap_or_default()
    }
}
