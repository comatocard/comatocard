//! Vault configuration by the owner: approvers, accepted tokens, registry, ownership.

use near_sdk::json_types::{U64, U128};
use near_sdk::{AccountId, env, near, require};

use crate::types::TokenBalance;
use crate::{Vault, VaultExt, events};

#[near]
impl Vault {
    /// Adds or updates an approver, or removes it when `max_amount` is `None`.
    pub fn set_approver(&mut self, account_id: AccountId, max_amount: Option<U128>) {
        self.assert_owner();
        match max_amount {
            Some(limit) => {
                require!(limit.0 > 0, "max_amount must be positive");
                self.approvers.insert(account_id.clone(), limit.0);
            }
            None => {
                require!(
                    self.approvers.remove(&account_id).is_some(),
                    "account is not an approver"
                );
            }
        }
        events::approver_set(&account_id, max_amount);
    }

    /// Starts or stops accepting deposits of `token`. Existing balances stay withdrawable.
    pub fn set_accepted_token(&mut self, token: AccountId, accepted: bool) {
        self.assert_owner();
        if let Some(balance) = self.balances.get_mut(&token) {
            balance.accepted = accepted;
        } else {
            require!(accepted, "token is not in the ledger");
            self.balances.insert(
                token,
                TokenBalance {
                    accepted: true,
                    ..TokenBalance::default()
                },
            );
        }
    }

    pub fn set_registry(&mut self, registry: Option<AccountId>) {
        self.assert_owner();
        self.registry = registry;
    }

    pub fn set_approval_ttl(&mut self, ttl: U64) {
        self.assert_owner();
        require!(ttl.0 > 0, "approval_ttl must be positive");
        self.approval_ttl = ttl.0;
    }

    /// First step of an ownership transfer.
    pub fn propose_owner(&mut self, new_owner: AccountId) {
        self.assert_owner();
        require!(new_owner != self.owner, "account is already the owner");
        events::owner_event("owner_proposed", &new_owner);
        self.pending_owner = Some(new_owner);
    }

    /// Second step of an ownership transfer, called by the proposed owner.
    pub fn accept_owner(&mut self) {
        let caller = env::predecessor_account_id();
        require!(
            self.pending_owner.as_ref() == Some(&caller),
            "only the proposed owner may accept"
        );
        self.pending_owner = None;
        self.approvers.remove(&caller);
        events::owner_event("owner_changed", &caller);
        self.owner = caller;
    }
}
