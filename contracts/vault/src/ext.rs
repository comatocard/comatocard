//! Interfaces of contracts the vault calls. NEP-141 transfers use `ext_ft_core` from
//! `near-contract-standards`; only the Comatocard registry needs its own interface.

use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;
use near_sdk::{AccountId, ext_contract, near};

use crate::types::RegistryStatus;

#[ext_contract(ext_registry)]
#[expect(
    dead_code,
    reason = "the trait only describes the remote contract for ext_contract"
)]
pub trait Registry {
    fn get_status(&self, account_id: AccountId) -> RegistryStatus;
}

/// The part of a Rhea (Burrow) lending account the vault reads.
#[near(serializers = [json])]
pub struct VenueAccount {
    pub supplied: Vec<VenueAsset>,
}

/// A supplied asset; `balance` carries the venue's extra decimals.
#[near(serializers = [json])]
pub struct VenueAsset {
    pub token_id: AccountId,
    pub balance: U128,
}

/// The part of a venue asset the vault reads: its extra decimals.
#[near(serializers = [json])]
pub struct VenueAssetConfig {
    pub config: VenueAssetSettings,
}

#[near(serializers = [json])]
pub struct VenueAssetSettings {
    /// Extra precision of the venue's internal balance for this token (12 for USDC on Rhea).
    pub extra_decimals: u8,
}

#[ext_contract(ext_venue)]
#[expect(
    dead_code,
    reason = "the trait only describes the remote contract for ext_contract"
)]
pub trait Venue {
    fn get_account(&self, account_id: AccountId) -> Option<VenueAccount>;
    fn get_asset(&self, token_id: AccountId) -> Option<VenueAssetConfig>;
    fn execute(&mut self, actions: Value);
}
