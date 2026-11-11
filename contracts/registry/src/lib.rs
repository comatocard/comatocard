//! Comatocard counterparty registry.
//!
//! Anyone files a report about an account with evidence, paying for the storage it uses.
//! Curators appointed by the owner set the account status to clear, flagged or blocked, citing
//! the reports they relied on. Vaults read `get_status` before paying when a card asks for it.

use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{AccountId, BorshStorageKey, PanicOnDefault, env, near, require};

mod curation;
mod events;
mod reports;
pub mod sanctions;
pub mod types;
mod views;

pub use sanctions::{SANCTIONS_LISTS, is_sanctions_evidence};
pub use types::{Category, Record, Report, ReportId, Status};

/// Maximum byte length of an evidence URI.
pub const MAX_EVIDENCE_URI_LEN: usize = 256;
/// Maximum number of reports kept per account.
pub const MAX_REPORTS_PER_ACCOUNT: usize = 100;

const MAX_PAGE: u32 = 100;

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Curators,
    Reports,
    AccountReports,
    Records,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Registry {
    owner: AccountId,
    curators: IterableSet<AccountId>,
    next_report_id: ReportId,
    reports: IterableMap<ReportId, Report>,
    account_reports: LookupMap<AccountId, Vec<ReportId>>,
    records: LookupMap<AccountId, Record>,
}

#[near]
impl Registry {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            curators: IterableSet::new(StorageKey::Curators),
            next_report_id: 0,
            reports: IterableMap::new(StorageKey::Reports),
            account_reports: LookupMap::new(StorageKey::AccountReports),
            records: LookupMap::new(StorageKey::Records),
        }
    }
}

impl Registry {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner may call this method"
        );
    }
}

#[cfg(test)]
mod tests;
