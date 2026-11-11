//! Contract-level unit tests with a mocked blockchain. Asynchronous results are simulated by
//! calling the callbacks with explicit promise results.

use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;

use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;

use near_sdk::json_types::{U64, U128};

use near_sdk::test_utils::{VMContextBuilder, get_logs};

use near_sdk::{AccountId, NearToken, PromiseError, PublicKey, testing_env};

use crate::types::{
    CardKind, CardStatus, MerchantRule, PaymentDecision, PaymentPreview, PaymentStatus, Policy,
    QueueCause, RegistryStatus, RejectReason, RiskMode,
};

use crate::{MIN_HOLDER_ALLOWANCE, Vault};

const NOW: u64 = 1_800_000_000 * 1_000_000_000;

mod approvals;
mod audit;
mod cards;
mod nft;
mod owner;
mod payments;
mod risk;

fn id(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn vault_id() -> AccountId {
    id("vault.near")
}

fn owner() -> AccountId {
    id("owner.near")
}

fn token() -> AccountId {
    id("usd.near")
}

fn shop() -> AccountId {
    id("shop.near")
}

fn registry() -> AccountId {
    id("registry.near")
}

fn card_key() -> PublicKey {
    "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp"
        .parse()
        .unwrap()
}

fn other_key() -> PublicKey {
    "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847"
        .parse()
        .unwrap()
}

fn policy() -> Policy {
    Policy {
        token: token(),
        per_tx_limit: U128(100),
        daily_limit: U128(150),
        monthly_limit: U128(1_000),
        approval_threshold: Some(U128(50)),
        merchants: MerchantRule::Any,
        valid_from: None,
        expires_at: None,
        risk_mode: RiskMode::Off,
    }
}

struct Harness {
    vault: Vault,
    context: VMContextBuilder,
}

impl Harness {
    fn new() -> Self {
        let mut context = VMContextBuilder::new();
        context
            .current_account_id(vault_id())
            .predecessor_account_id(owner())
            .block_timestamp(NOW);
        testing_env!(context.build());
        let vault = Vault::new(owner(), vec![token()], Some(registry()), None);
        let mut harness = Self { vault, context };
        harness.as_account(token());
        harness
            .vault
            .ft_on_transfer(owner(), U128(1_000), String::new())
            .ok();
        harness.as_account(owner());
        harness.vault.create_card(
            card_key(),
            "research agent".to_owned(),
            CardKind::Agent,
            policy(),
            None,
        );
        harness
    }

    fn as_account(&mut self, account: AccountId) {
        testing_env!(self.context.predecessor_account_id(account).build());
    }

    fn as_card(&mut self, key: PublicKey) {
        testing_env!(
            self.context
                .predecessor_account_id(vault_id())
                .signer_account_pk(key)
                .build()
        );
    }

    fn at(&mut self, timestamp: u64) {
        testing_env!(self.context.block_timestamp(timestamp).build());
    }

    fn pay(&mut self, amount: u128) -> PaymentDecision {
        self.as_card(card_key());
        self.vault
            .pay(shop(), U128(amount), None, Some("inv-1".to_owned()))
    }

    fn available(&self) -> u128 {
        self.vault.get_balances()[0].available.0
    }

    fn reserved(&self) -> u128 {
        self.vault.get_balances()[0].reserved.0
    }

    fn day_spent(&self) -> u128 {
        self.vault.get_card(0).unwrap().spend.day_spent.0
    }
}

trait PromiseOrValueExt {
    fn ok(self);
}

impl PromiseOrValueExt for near_sdk::PromiseOrValue<U128> {
    fn ok(self) {
        match self {
            near_sdk::PromiseOrValue::Value(refund) => assert_eq!(refund.0, 0),
            near_sdk::PromiseOrValue::Promise(_) => panic!("unexpected promise"),
        }
    }
}

fn has_event(name: &str) -> bool {
    let needle = format!("\"event\":\"{name}\"");
    get_logs().iter().any(|log| log.contains(&needle))
}

fn with_risk_mode(mode: RiskMode) -> Harness {
    let mut harness = Harness::new();
    let mut risky = policy();
    risky.risk_mode = mode;
    harness.vault.update_policy(0, risky);
    harness
}

fn agent() -> AccountId {
    id("agent.near")
}

impl Harness {
    fn with_deposit(&mut self, account: AccountId, deposit: NearToken) {
        testing_env!(
            self.context
                .predecessor_account_id(account)
                .attached_deposit(deposit)
                .build()
        );
    }

    fn transfer(&mut self, from: AccountId, to: AccountId) {
        self.with_deposit(from, NearToken::from_yoctonear(1));
        self.vault.nft_transfer(to, "0".to_owned(), None, None);
    }
}

fn resolve(harness: &mut Harness, result: near_sdk::PromiseResult) -> bool {
    use near_contract_standards::non_fungible_token::core::NonFungibleTokenResolver;
    testing_env!(
        harness
            .context
            .predecessor_account_id(vault_id())
            .attached_deposit(NearToken::from_yoctonear(0))
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        vec![result]
    );
    harness
        .vault
        .nft_resolve_transfer(owner(), agent(), "0".to_owned(), None)
}

/// A harness whose card queues every payment above 1 unit.
fn queueing() -> Harness {
    let mut harness = Harness::new();
    let mut eager = policy();
    eager.approval_threshold = Some(U128(1));
    eager.daily_limit = U128(1_000);
    harness.vault.update_policy(0, eager);
    harness
}

fn queued_payment() -> Harness {
    let mut harness = Harness::new();
    assert!(matches!(harness.pay(60), PaymentDecision::Queued { .. }));
    harness.as_account(owner());
    harness
}
