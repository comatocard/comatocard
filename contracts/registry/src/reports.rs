//! Reports: anyone files one with evidence and pays for its storage; sanctions reports are
//! curator-only and must name their list.

use comatocard_common::events::emit;
use near_sdk::{AccountId, NearToken, Promise, env, near, require};

use crate::events::ReportSubmitted;
use crate::types::{Category, Report, ReportId};
use crate::{
    MAX_EVIDENCE_URI_LEN, MAX_REPORTS_PER_ACCOUNT, Registry, RegistryExt, is_sanctions_evidence,
};

#[near]
impl Registry {
    /// Files a report. The attached deposit must cover the storage the report uses; the rest is
    /// refunded.
    #[payable]
    pub fn report(
        &mut self,
        account_id: AccountId,
        category: Category,
        evidence_uri: String,
    ) -> ReportId {
        require!(
            !evidence_uri.is_empty() && evidence_uri.len() <= MAX_EVIDENCE_URI_LEN,
            "evidence_uri must be 1 to 256 bytes"
        );
        let reporter_id = env::predecessor_account_id();
        require!(reporter_id != account_id, "an account cannot report itself");
        if category == Category::Sanctions {
            require!(
                self.curators.contains(&reporter_id),
                "only curators file sanctions reports"
            );
            require!(
                is_sanctions_evidence(&evidence_uri),
                "sanctions evidence must be sanctions:<LIST>:<YYYY-MM-DD>[:<reference>]"
            );
        }
        let storage_before = env::storage_usage();

        let mut ids = self
            .account_reports
            .get(&account_id)
            .cloned()
            .unwrap_or_default();
        require!(
            ids.len() < MAX_REPORTS_PER_ACCOUNT,
            "account has the maximum number of reports"
        );
        let id = self.next_report_id;
        self.next_report_id += 1;
        ids.push(id);
        self.account_reports.insert(account_id.clone(), ids);
        let report = Report {
            id,
            account_id,
            reporter_id: reporter_id.clone(),
            category,
            evidence_uri,
            created_at: env::block_timestamp().into(),
        };
        emit(
            "report_submitted",
            &ReportSubmitted {
                report_id: id,
                account_id: &report.account_id,
                reporter_id: &report.reporter_id,
                category: report.category,
                evidence_uri: &report.evidence_uri,
            },
        );
        self.reports.insert(id, report);
        self.reports.flush();
        self.account_reports.flush();

        let used = env::storage_usage().saturating_sub(storage_before);
        let cost = env::storage_byte_cost().saturating_mul(u128::from(used));
        let attached = env::attached_deposit();
        require!(
            attached >= cost,
            format!("attach at least {cost} to cover storage")
        );
        let refund = attached.saturating_sub(cost);
        if refund > NearToken::from_yoctonear(0) {
            Promise::new(reporter_id).transfer(refund).detach();
        }
        id
    }
}
