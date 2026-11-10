//! Token ledger: deposits through `ft_on_transfer`, owner withdrawals.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, NearToken, PromiseError, PromiseOrValue, env, near, require};

use crate::ext::ext_ft;
use crate::types::TokenBalance;
use crate::{GAS_CALLBACK, GAS_FT_TRANSFER, Vault, VaultExt, events};

#[near]
impl Vault {
    /// NEP-141 receiver. Credits accepted tokens and refunds everything else.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let _ = msg;
        let token = env::predecessor_account_id();
        match self.balances.get_mut(&token) {
            Some(balance) if balance.accepted => {
                balance.available = (balance.available.0 + amount.0).into();
                events::deposit(&token, &sender_id, amount);
                PromiseOrValue::Value(U128(0))
            }
            _ => PromiseOrValue::Value(amount),
        }
    }

    /// Transfers available funds out of the vault. Restored if the transfer fails.
    pub fn withdraw(&mut self, token: AccountId, amount: U128, receiver_id: AccountId) {
        self.assert_owner();
        require!(amount.0 > 0, "amount must be positive");
        let balance = self.balance_mut(&token);
        require!(
            balance.available.0 >= amount.0,
            "insufficient available balance"
        );
        balance.available = (balance.available.0 - amount.0).into();
        ext_ft::ext(token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(receiver_id.clone(), amount, None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_withdraw_transferred(token, amount, receiver_id),
            )
            .detach();
    }

    #[private]
    pub fn on_withdraw_transferred(
        &mut self,
        token: AccountId,
        amount: U128,
        receiver_id: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        let success = result.is_ok();
        if !success {
            let balance = self.balance_mut(&token);
            balance.available = (balance.available.0 + amount.0).into();
        }
        events::withdrawal(&token, &receiver_id, amount, success);
    }
}

impl Vault {
    pub(crate) fn balance_mut(&mut self, token: &AccountId) -> &mut TokenBalance {
        self.balances
            .get_mut(token)
            .unwrap_or_else(|| env::panic_str("token is not in the ledger"))
    }
}
