//! Test USD (`tUSD`): a NEP-141 stablecoin for testnet with a public, capped faucet.
//!
//! The token exists so that judges and developers can fund Comatocard vaults without real money.
//! It must never be deployed to mainnet.

use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::{
    FT_METADATA_SPEC, FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue, near, require,
};

/// Token decimals, matching common USD stablecoins.
pub const DECIMALS: u8 = 6;

/// Largest amount a single faucet call may mint: 10,000 tUSD.
pub const MINT_CAP: u128 = 10_000 * 10u128.pow(DECIMALS as u32);

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Accounts,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            token: FungibleToken::new(StorageKey::Accounts),
        }
    }

    /// Mints `amount` to a registered account. Anyone may call it; each call is capped.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(
            amount.0 > 0 && amount.0 <= MINT_CAP,
            "amount must be positive and at most the mint cap"
        );
        require!(
            self.token.accounts.contains_key(&account_id),
            "account is not registered, call storage_deposit first"
        );
        self.token.internal_deposit(&account_id, amount.0);
        FtMint {
            owner_id: &account_id,
            amount,
            memo: Some("faucet"),
        }
        .emit();
    }

    /// Largest amount a single `mint` call accepts.
    pub fn mint_cap(&self) -> U128 {
        U128(MINT_CAP)
    }
}

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo);
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned > 0 {
            FtBurn {
                owner_id: &sender_id,
                amount: U128(burned),
                memo: Some("refund to an unregistered sender"),
            }
            .emit();
        }
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        match self.token.internal_storage_unregister(force) {
            Some((account_id, balance)) => {
                if balance > 0 {
                    FtBurn {
                        owner_id: &account_id,
                        amount: U128(balance),
                        memo: Some("storage unregister"),
                    }
                    .emit();
                }
                true
            }
            None => false,
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_owned(),
            name: "Test USD".to_owned(),
            symbol: "tUSD".to_owned(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: DECIMALS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts, get_logs};
    use near_sdk::testing_env;

    fn setup() -> (Contract, VMContextBuilder) {
        let mut context = VMContextBuilder::new();
        context.predecessor_account_id(accounts(0));
        testing_env!(context.build());
        (Contract::new(), context)
    }

    fn register(contract: &mut Contract, context: &mut VMContextBuilder, account: &AccountId) {
        let min = contract.storage_balance_bounds().min;
        testing_env!(context.attached_deposit(min).build());
        contract.storage_deposit(Some(account.clone()), Some(true));
        testing_env!(
            context
                .attached_deposit(NearToken::from_yoctonear(0))
                .build()
        );
    }

    #[test]
    fn mint_credits_registered_account_and_emits_event() {
        let (mut contract, mut context) = setup();
        register(&mut contract, &mut context, &accounts(1));
        contract.mint(accounts(1), U128(5_000_000));
        assert_eq!(contract.ft_balance_of(accounts(1)).0, 5_000_000);
        assert_eq!(contract.ft_total_supply().0, 5_000_000);
        assert!(
            get_logs()
                .iter()
                .any(|log| log.contains("\"event\":\"ft_mint\""))
        );
    }

    #[test]
    fn mint_accepts_exactly_the_cap() {
        let (mut contract, mut context) = setup();
        register(&mut contract, &mut context, &accounts(1));
        contract.mint(accounts(1), contract.mint_cap());
        assert_eq!(contract.ft_balance_of(accounts(1)).0, MINT_CAP);
    }

    #[test]
    #[should_panic(expected = "at most the mint cap")]
    fn mint_rejects_above_cap() {
        let (mut contract, mut context) = setup();
        register(&mut contract, &mut context, &accounts(1));
        contract.mint(accounts(1), U128(MINT_CAP + 1));
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn mint_rejects_zero() {
        let (mut contract, mut context) = setup();
        register(&mut contract, &mut context, &accounts(1));
        contract.mint(accounts(1), U128(0));
    }

    #[test]
    #[should_panic(expected = "account is not registered")]
    fn mint_rejects_unregistered_account() {
        let (mut contract, _) = setup();
        contract.mint(accounts(2), U128(1));
    }

    #[test]
    fn metadata_is_valid() {
        let (contract, _) = setup();
        let metadata = contract.ft_metadata();
        metadata.assert_valid();
        assert_eq!(metadata.symbol, "tUSD");
        assert_eq!(metadata.decimals, DECIMALS);
    }
}
