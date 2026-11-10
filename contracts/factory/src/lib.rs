//! Comatocard factory.
//!
//! The owner publishes the vault wasm once as a global contract (NEP-591, by code hash). Anyone
//! then creates a vault `<name>.<factory>` that uses that code, for well under 0.001 NEAR of code
//! storage. Vaults keep the code hash they were created with; publishing new code only affects
//! vaults created afterwards.

use comatocard_common::events::emit;
use near_sdk::json_types::{Base58CryptoHash, U64};
use near_sdk::serde_json::json;
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, CryptoHash, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    env, near, require,
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
            &json!({ "code_hash": encoded, "code_version": self.code_version }),
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
        let init_args = json!({
            "owner": owner,
            "accepted_tokens": accepted_tokens.unwrap_or_else(|| self.default_tokens.clone()),
            "registry": registry.or_else(|| self.default_registry.clone()),
            "approval_ttl": approval_ttl,
        });

        Promise::new(vault_id.clone())
            .create_account()
            .transfer(deposit)
            .use_global_contract(code_hash)
            .function_call(
                "new".to_owned(),
                init_args.to_string().into_bytes(),
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
            &json!({ "vault_id": vault_id, "owner_id": owner, "code_version": code_version }),
        );
        Some(vault_id)
    }

    pub fn list_vaults(&self, owner: AccountId) -> Vec<AccountId> {
        self.vaults_by_owner
            .get(&owner)
            .cloned()
            .unwrap_or_default()
    }

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

impl Factory {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner may call this method"
        );
    }
}

#[cfg(test)]
mod tests {
    use near_sdk::test_utils::{VMContextBuilder, get_logs};
    use near_sdk::testing_env;

    use super::*;

    fn id(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn setup() -> (Factory, VMContextBuilder) {
        let mut context = VMContextBuilder::new();
        context
            .current_account_id(id("factory.near"))
            .predecessor_account_id(id("owner.near"));
        testing_env!(context.build());
        (
            Factory::new(id("owner.near"), vec![id("usd.near")], None),
            context,
        )
    }

    fn with_input(context: &VMContextBuilder, input: &[u8]) -> near_sdk::VMContext {
        let mut built = context.build();
        built.input = input.to_vec().into();
        built
    }

    /// Marks code as published without deploying it; deployment is covered by sandbox tests.
    fn publish(factory: &mut Factory) {
        factory.vault_code_hash = Some([7; 32]);
        factory.code_version = 1;
    }

    #[test]
    fn publish_records_the_code_hash() {
        let (mut factory, context) = setup();
        testing_env!(with_input(&context, b"\0asm-vault"));
        let hash = factory.publish_vault_code();
        let config = factory.get_config();
        assert_eq!(config.vault_code_hash, Some(hash));
        assert_eq!(config.code_version, 1);
    }

    #[test]
    fn golden_fixtures_match_the_sdk() {
        let (mut factory, mut context) = setup();
        testing_env!(with_input(&context, b"\0asm-vault"));
        factory.publish_vault_code();
        // `testing_env!` clears the logs, so collect them before switching the caller.
        let mut events = get_logs();
        testing_env!(context.predecessor_account_id(id("factory.near")).build());
        factory.on_vault_created(
            id("alice.factory.near"),
            id("alice.near"),
            id("alice.near"),
            MIN_VAULT_DEPOSIT,
            1,
            Ok(()),
        );
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../packages/sdk/test/fixtures/factory-events.jsonl");
        events.extend(get_logs());
        comatocard_common::golden::assert_matches(&path, &events);
    }

    #[test]
    #[should_panic(expected = "vault code is not published yet")]
    fn create_requires_published_code() {
        let (mut factory, mut context) = setup();
        testing_env!(context.attached_deposit(MIN_VAULT_DEPOSIT).build());
        let _ = factory.create_vault("alice".to_owned(), None, None, None, None);
    }

    #[test]
    #[should_panic(expected = "attach at least")]
    fn create_requires_minimum_deposit() {
        let (mut factory, mut context) = setup();
        publish(&mut factory);
        testing_env!(
            context
                .attached_deposit(NearToken::from_millinear(1))
                .build()
        );
        let _ = factory.create_vault("alice".to_owned(), None, None, None, None);
    }

    #[test]
    #[should_panic(expected = "single account label")]
    fn create_rejects_nested_names() {
        let (mut factory, mut context) = setup();
        publish(&mut factory);
        testing_env!(context.attached_deposit(MIN_VAULT_DEPOSIT).build());
        let _ = factory.create_vault("a.b".to_owned(), None, None, None, None);
    }

    #[test]
    fn successful_creation_is_listed_and_failed_creation_is_not() {
        let (mut factory, mut context) = setup();
        testing_env!(context.predecessor_account_id(id("factory.near")).build());
        let created = factory.on_vault_created(
            id("alice.factory.near"),
            id("alice.near"),
            id("alice.near"),
            MIN_VAULT_DEPOSIT,
            1,
            Ok(()),
        );
        assert_eq!(created, Some(id("alice.factory.near")));
        assert!(
            get_logs()
                .iter()
                .any(|l| l.contains("\"event\":\"vault_created\""))
        );
        let failed = factory.on_vault_created(
            id("bob.factory.near"),
            id("bob.near"),
            id("bob.near"),
            MIN_VAULT_DEPOSIT,
            1,
            Err(PromiseError::Failed),
        );
        assert_eq!(failed, None);
        assert_eq!(
            factory.list_vaults(id("alice.near")),
            vec![id("alice.factory.near")]
        );
        assert!(factory.list_vaults(id("bob.near")).is_empty());
    }

    #[test]
    #[should_panic(expected = "only the owner may call this method")]
    fn only_owner_sets_defaults() {
        let (mut factory, mut context) = setup();
        testing_env!(context.predecessor_account_id(id("eve.near")).build());
        factory.set_defaults(vec![], None);
    }
}
