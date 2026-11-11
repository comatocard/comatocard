//! Interfaces of contracts the vault calls. NEP-141 transfers use `ext_ft_core` from
//! `near-contract-standards`; only the Comatocard registry needs its own interface.

use near_sdk::{AccountId, ext_contract};

use crate::types::RegistryStatus;

#[ext_contract(ext_registry)]
#[expect(
    dead_code,
    reason = "the trait only describes the remote contract for ext_contract"
)]
pub trait Registry {
    fn get_status(&self, account_id: AccountId) -> RegistryStatus;
}
