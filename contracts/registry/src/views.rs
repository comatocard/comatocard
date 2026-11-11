//! Read-only methods.

use near_sdk::{AccountId, near};

use crate::types::{Record, Report, ReportId, Status};
use crate::{MAX_PAGE, Registry, RegistryExt};

#[near]
impl Registry {
    /// Status used by vaults. Accounts without a record are clear.
    pub fn get_status(&self, account_id: AccountId) -> Status {
        self.records
            .get(&account_id)
            .map_or(Status::Clear, |record| record.status)
    }

    pub fn get_record(&self, account_id: AccountId) -> Option<Record> {
        self.records.get(&account_id).cloned()
    }

    pub fn get_report(&self, report_id: ReportId) -> Option<Report> {
        self.reports.get(&report_id).cloned()
    }

    pub fn list_reports(
        &self,
        account_id: AccountId,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<Report> {
        self.account_reports
            .get(&account_id)
            .map(|ids| {
                ids.iter()
                    .skip(from_index.unwrap_or(0) as usize)
                    .take(limit.unwrap_or(MAX_PAGE).min(MAX_PAGE) as usize)
                    .filter_map(|id| self.reports.get(id).cloned())
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn list_curators(&self) -> Vec<AccountId> {
        self.curators.iter().cloned().collect()
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }
}
