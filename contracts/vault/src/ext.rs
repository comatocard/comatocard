//! Interfaces of contracts the vault calls.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, ext_contract};

use crate::types::RegistryStatus;

#[ext_contract(ext_ft)]
#[allow(dead_code)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[ext_contract(ext_registry)]
#[allow(dead_code)]
pub trait Registry {
    fn get_status(&self, account_id: AccountId) -> RegistryStatus;
}
