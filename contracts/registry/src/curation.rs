//! Curation: the owner appoints curators, and curators set statuses that cite reports.

use comatocard_common::events::emit;
use near_sdk::{AccountId, env, near, require};

use crate::events::StatusChanged;
use crate::types::{Record, ReportId, Status};
use crate::{Registry, RegistryExt};

#[near]
impl Registry {
    pub fn add_curator(&mut self, account_id: AccountId) {
        self.assert_owner();
        require!(
            self.curators.insert(account_id),
            "account is already a curator"
        );
    }

    pub fn remove_curator(&mut self, account_id: AccountId) {
        self.assert_owner();
        require!(
            self.curators.remove(&account_id),
            "account is not a curator"
        );
    }

    /// Sets the status of an account. Flagging or blocking must cite at least one report about
    /// that account.
    pub fn set_status(&mut self, account_id: AccountId, status: Status, report_ids: Vec<ReportId>) {
        let curator_id = env::predecessor_account_id();
        require!(
            self.curators.contains(&curator_id),
            "only a curator may set a status"
        );
        require!(
            status == Status::Clear || !report_ids.is_empty(),
            "flagging or blocking must cite a report"
        );
        for id in &report_ids {
            let report = self
                .reports
                .get(id)
                .unwrap_or_else(|| env::panic_str("report not found"));
            require!(
                report.account_id == account_id,
                "report is about another account"
            );
        }
        emit(
            "status_changed",
            &StatusChanged {
                account_id: &account_id,
                status,
                curator_id: &curator_id,
                report_ids: &report_ids,
            },
        );
        if status == Status::Clear && report_ids.is_empty() {
            self.records.remove(&account_id);
        } else {
            self.records.insert(
                account_id,
                Record {
                    status,
                    curator_id,
                    report_ids,
                    updated_at: env::block_timestamp().into(),
                },
            );
        }
    }
}
