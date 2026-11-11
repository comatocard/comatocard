//! Comatocard vault.
//!
//! A vault holds NEP-141 tokens and issues cards. A card is a function-call access key on the vault
//! account that may only call [`Vault::pay`]. The vault identifies the card through
//! `env::signer_account_pk()` and enforces the card policy on every payment. See
//! `docs/specs/vault-contract.md` for the interface and `docs/architecture.md` for the rationale.

use near_sdk::json_types::U64;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, PublicKey, env, near, require,
};

pub mod events;
pub mod policy;
pub mod types;
pub use nft::MIN_HOLDER_ALLOWANCE;

mod cards;
mod ext;
mod ledger;
mod nft;
mod owner;
mod payments;
mod views;

use types::{Card, CardId, Payment, PaymentId, TokenBalance};

/// Version reported by `get_config`, bumped with every state or interface change.
pub const CONTRACT_VERSION: &str = "0.2.1";

/// Default time a queued payment waits before anyone may expire it: 24 hours.
pub const DEFAULT_APPROVAL_TTL_NS: u64 = 24 * 60 * 60 * 1_000_000_000;

/// Default gas allowance of a card key: 1 NEAR. A card transaction should attach at most
/// [`CARD_TX_GAS_TGAS`]; at the protocol minimum gas price that is 0.01 NEAR of allowance, so
/// about 100 payments before the key needs a rotation. The vault account pays this gas.
pub const DEFAULT_CARD_ALLOWANCE: NearToken = NearToken::from_near(1);

/// Gas, in Tgas, a card transaction should attach to `pay`. It covers the registry check, the
/// token transfer and both callbacks.
pub const CARD_TX_GAS_TGAS: u64 = 100;

pub(crate) const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
pub(crate) const GAS_REGISTRY_CHECK: Gas = Gas::from_tgas(5);
pub(crate) const GAS_CALLBACK: Gas = Gas::from_tgas(25);

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Cards,
    CardKeys,
    Approvers,
    Balances,
    Payments,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    owner: AccountId,
    pending_owner: Option<AccountId>,
    factory: Option<AccountId>,
    registry: Option<AccountId>,
    approval_ttl: u64,
    next_card_id: CardId,
    next_payment_id: PaymentId,
    cards: IterableMap<CardId, Card>,
    card_keys: LookupMap<PublicKey, CardId>,
    approvers: IterableMap<AccountId, u128>,
    balances: IterableMap<AccountId, TokenBalance>,
    payments: IterableMap<PaymentId, Payment>,
}

#[near]
impl Vault {
    /// Initializes the vault. When called by a factory, the factory is recorded.
    #[init]
    pub fn new(
        owner: AccountId,
        accepted_tokens: Vec<AccountId>,
        registry: Option<AccountId>,
        approval_ttl: Option<U64>,
    ) -> Self {
        let predecessor = env::predecessor_account_id();
        let factory = (predecessor != owner && predecessor != env::current_account_id())
            .then_some(predecessor);
        let mut vault = Self {
            owner,
            pending_owner: None,
            factory,
            registry,
            approval_ttl: approval_ttl.map_or(DEFAULT_APPROVAL_TTL_NS, |ttl| ttl.0),
            next_card_id: 0,
            next_payment_id: 0,
            cards: IterableMap::new(StorageKey::Cards),
            card_keys: LookupMap::new(StorageKey::CardKeys),
            approvers: IterableMap::new(StorageKey::Approvers),
            balances: IterableMap::new(StorageKey::Balances),
            payments: IterableMap::new(StorageKey::Payments),
        };
        require!(vault.approval_ttl > 0, "approval_ttl must be positive");
        for token in accepted_tokens {
            vault.balances.insert(
                token,
                TokenBalance {
                    accepted: true,
                    ..TokenBalance::default()
                },
            );
        }
        vault
    }
}

impl Vault {
    pub(crate) fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner may call this method"
        );
    }

    pub(crate) fn card_mut(&mut self, card_id: CardId) -> &mut Card {
        self.cards
            .get_mut(&card_id)
            .unwrap_or_else(|| env::panic_str("card not found"))
    }
}

#[cfg(test)]
mod tests;
