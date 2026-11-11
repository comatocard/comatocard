//! Factory events in the Comatocard NEP-297 standard.

use near_sdk::AccountId;
use near_sdk::json_types::Base58CryptoHash;
use near_sdk::serde::Serialize;

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(crate) struct CodePublished {
    pub(crate) code_hash: Base58CryptoHash,
    pub(crate) code_version: u32,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(crate) struct VaultCreated<'a> {
    pub(crate) vault_id: &'a AccountId,
    pub(crate) owner_id: &'a AccountId,
    pub(crate) code_version: u32,
}
