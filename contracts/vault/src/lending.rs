//! Idle balance lent to one lending venue with a Rhea (Burrow) interface, and taken back. The
//! vault itself supplies and withdraws, so the position stays the vault's; the owner or a keeper
//! only decides when. See "Idle funds in lending" in `docs/specs/vault-contract.md`.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{AccountId, Gas, NearToken, PromiseError, env, near, require};

use crate::ext::{VenueAccount, ext_venue};
use crate::types::{LendingToken, YieldTokenView, YieldView};
use crate::{GAS_CALLBACK, Vault, VaultExt, events};

const GAS_SUPPLY_TRANSFER: Gas = Gas::from_tgas(60);
const GAS_VENUE_VIEW: Gas = Gas::from_tgas(10);
const GAS_VENUE_EXECUTE: Gas = Gas::from_tgas(70);
/// The account callback starts the withdrawal and its callback: 70 + 25 + 10 Tgas.
const GAS_ACCOUNT_CALLBACK: Gas = Gas::from_tgas(105);
/// Smallest prepaid gas `supply` accepts: the transfer, the venue's receiver, and the callback.
pub const MIN_SUPPLY_GAS: Gas = Gas::from_tgas(100);
/// Smallest prepaid gas `recall` accepts: the view, its callback, the withdrawal and its callback.
pub const MIN_RECALL_GAS: Gas = Gas::from_tgas(150);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[near]
impl Vault {
    /// Sets the lending venue and the keeper. The venue changes only while nothing is lent.
    pub fn set_yield_venue(&mut self, venue: Option<AccountId>, keeper: Option<AccountId>) {
        self.assert_owner();
        if venue != self.yield_venue {
            require!(
                self.lending
                    .values()
                    .all(|t| t.supplied.0 == 0 && !t.pending),
                "recall every token before changing the venue"
            );
        }
        self.yield_venue = venue;
        self.yield_keeper = keeper;
    }

    /// Enables lending of an accepted token, keeping `min_liquid` available for cards.
    pub fn set_yield_token(&mut self, token: AccountId, min_liquid: U128, extra_decimals: u8) {
        self.assert_owner();
        require!(
            self.balances.contains_key(&token),
            "token is not in the ledger"
        );
        require!(extra_decimals <= 24, "extra_decimals must be at most 24");
        let entry = self.lending.entry(token).or_default();
        entry.min_liquid = min_liquid;
        entry.extra_decimals = extra_decimals;
    }

    /// Lends `amount` of `token` to the venue if `min_liquid` stays available.
    pub fn supply(&mut self, token: AccountId, amount: U128) {
        self.assert_yield_operator();
        require!(
            env::prepaid_gas() >= MIN_SUPPLY_GAS,
            "attach at least 100 Tgas"
        );
        let venue = self.venue();
        require!(amount.0 > 0, "amount must be positive");
        let position = self.lending_token(&token);
        require!(
            !position.pending,
            "a lending operation is in flight for this token"
        );
        let min_liquid = position.min_liquid.0;
        let balance = self.balance_mut(&token);
        require!(
            balance.available.0 >= amount.0.saturating_add(min_liquid),
            "supply would leave less than min_liquid available"
        );
        balance.available = (balance.available.0 - amount.0).into();
        let position = self.lending_token_mut(&token);
        position.pending = true;
        position.supplied = (position.supplied.0 + amount.0).into();

        ext_ft_core::ext(token.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_SUPPLY_TRANSFER)
            .ft_transfer_call(venue, amount, None, String::new())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_yield_supplied(token, amount),
            )
            .detach();
    }

    /// Takes back up to `amount` of `token` from the venue, interest included.
    pub fn recall(&mut self, token: AccountId, amount: U128) {
        self.assert_yield_operator();
        require!(
            env::prepaid_gas() >= MIN_RECALL_GAS,
            "attach at least 150 Tgas"
        );
        let venue = self.venue();
        require!(amount.0 > 0, "amount must be positive");
        let position = self.lending_token_mut(&token);
        require!(
            !position.pending,
            "a lending operation is in flight for this token"
        );
        position.pending = true;

        ext_venue::ext(venue)
            .with_static_gas(GAS_VENUE_VIEW)
            .get_account(env::current_account_id())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ACCOUNT_CALLBACK)
                    .on_yield_account(token, amount),
            )
            .detach();
    }

    /// Clears a stuck in-flight flag, for example after a callback ran out of gas.
    pub fn clear_yield_pending(&mut self, token: AccountId) {
        self.assert_owner();
        self.lending_token_mut(&token).pending = false;
    }

    pub fn get_yield(&self) -> YieldView {
        YieldView {
            venue: self.yield_venue.clone(),
            keeper: self.yield_keeper.clone(),
            tokens: self
                .lending
                .iter()
                .map(|(token, t)| YieldTokenView {
                    token: token.clone(),
                    min_liquid: t.min_liquid,
                    extra_decimals: t.extra_decimals,
                    supplied: t.supplied,
                    pending: t.pending,
                })
                .collect(),
        }
    }

    /// Credits back what the venue did not accept. The token returns the used amount.
    #[private]
    pub fn on_yield_supplied(
        &mut self,
        token: AccountId,
        amount: U128,
        #[callback_result] used: Result<U128, PromiseError>,
    ) {
        // A failed transfer call moved nothing; a refused one returns 0 used.
        let accepted = used.map_or(0, |u| u.0.min(amount.0));
        let refund = amount.0 - accepted;
        let position = self.lending_token_mut(&token);
        position.pending = false;
        position.supplied = position.supplied.0.saturating_sub(refund).into();
        if refund > 0 {
            let balance = self.balance_mut(&token);
            balance.available = (balance.available.0 + refund).into();
        }
        events::yield_supplied(&token, &self.venue(), amount, U128(accepted));
    }

    /// Withdraws `min(amount, supplied at the venue)` once the venue account is known.
    #[private]
    pub fn on_yield_account(
        &mut self,
        token: AccountId,
        amount: U128,
        #[callback_result] account: Result<Option<VenueAccount>, PromiseError>,
    ) {
        let venue = self.venue();
        let extra = self.lending_token(&token).extra_decimals;
        let scale = 10u128.pow(u32::from(extra));
        let at_venue = account
            .ok()
            .flatten()
            .and_then(|a| a.supplied.into_iter().find(|s| s.token_id == token))
            .map_or(0, |s| s.balance.0 / scale);
        let take = amount.0.min(at_venue);
        if take == 0 {
            self.lending_token_mut(&token).pending = false;
            events::yield_recalled(&token, &venue, U128(0), false);
            return;
        }
        // `take <= balance / scale`, so `take * scale <= balance` cannot overflow.
        let actions =
            json!([{ "Withdraw": { "token_id": token, "max_amount": U128(take * scale) } }]);
        ext_venue::ext(venue)
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_VENUE_EXECUTE)
            .execute(actions)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_yield_recalled(token, U128(take)),
            )
            .detach();
    }

    /// Credits the withdrawn amount once the venue accepted the withdrawal.
    #[private]
    pub fn on_yield_recalled(
        &mut self,
        token: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        let success = result.is_ok();
        let position = self.lending_token_mut(&token);
        position.pending = false;
        if success {
            position.supplied = position.supplied.0.saturating_sub(amount.0).into();
            let balance = self.balance_mut(&token);
            balance.available = (balance.available.0 + amount.0).into();
        }
        events::yield_recalled(&token, &self.venue(), amount, success);
    }
}

impl Vault {
    fn assert_yield_operator(&self) {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.owner || self.yield_keeper.as_ref() == Some(&caller),
            "only the owner or the keeper may call this method"
        );
    }

    fn venue(&self) -> AccountId {
        self.yield_venue
            .clone()
            .unwrap_or_else(|| env::panic_str("no lending venue is set"))
    }

    fn lending_token(&self, token: &AccountId) -> &LendingToken {
        self.lending
            .get(token)
            .unwrap_or_else(|| env::panic_str("token is not enabled for lending"))
    }

    fn lending_token_mut(&mut self, token: &AccountId) -> &mut LendingToken {
        self.lending
            .get_mut(token)
            .unwrap_or_else(|| env::panic_str("token is not enabled for lending"))
    }
}
