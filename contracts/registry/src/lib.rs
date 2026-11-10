//! Comatocard counterparty registry.
//!
//! Anyone files a report about an account with evidence, paying for the storage it uses.
//! Curators appointed by the owner set the account status to clear, flagged or blocked, citing
//! the reports they relied on. Vaults read `get_status` before paying when a card asks for it.

use comatocard_common::events::emit;
use near_sdk::json_types::U64;
use near_sdk::serde_json::json;
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, env, near, require,
};

/// Maximum byte length of an evidence URI.
pub const MAX_EVIDENCE_URI_LEN: usize = 256;
/// Maximum number of reports kept per account.
pub const MAX_REPORTS_PER_ACCOUNT: usize = 100;

const MAX_PAGE: u32 = 100;

pub type ReportId = u64;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Clear,
    Flagged,
    Blocked,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    Scam,
    Phishing,
    Drainer,
    Impersonation,
    Other,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Report {
    pub id: ReportId,
    pub account_id: AccountId,
    pub reporter_id: AccountId,
    pub category: Category,
    pub evidence_uri: String,
    pub created_at: U64,
}

/// The current curated status of an account.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Record {
    pub status: Status,
    pub curator_id: AccountId,
    pub report_ids: Vec<ReportId>,
    pub updated_at: U64,
}

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
            &json!({
                "report_id": id,
                "account_id": report.account_id,
                "reporter_id": report.reporter_id,
                "category": report.category,
                "evidence_uri": report.evidence_uri,
            }),
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
            &json!({
                "account_id": account_id,
                "status": status,
                "curator_id": curator_id,
                "report_ids": report_ids,
            }),
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

impl Registry {
    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner may call this method"
        );
    }
}

#[cfg(test)]
mod tests {
    use near_sdk::test_utils::{VMContextBuilder, get_logs};
    use near_sdk::testing_env;

    use super::*;

    fn id(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    struct Harness {
        registry: Registry,
        context: VMContextBuilder,
    }

    impl Harness {
        fn new() -> Self {
            let mut context = VMContextBuilder::new();
            context
                .current_account_id(id("registry.near"))
                .predecessor_account_id(id("owner.near"));
            testing_env!(context.build());
            let mut registry = Registry::new(id("owner.near"));
            registry.add_curator(id("curator.near"));
            Self { registry, context }
        }

        fn as_account(&mut self, account: &str, deposit: NearToken) {
            testing_env!(
                self.context
                    .predecessor_account_id(id(account))
                    .attached_deposit(deposit)
                    .build()
            );
        }

        fn report(&mut self, target: &str) -> ReportId {
            self.as_account("alice.near", NearToken::from_millinear(10));
            self.registry
                .report(id(target), Category::Scam, "ipfs://evidence".to_owned())
        }
    }

    #[test]
    fn golden_fixtures_match_the_sdk() {
        let mut harness = Harness::new();
        let report_id = harness.report("bad.testnet");
        // `testing_env!` clears the logs, so collect them before switching the caller.
        let mut events = get_logs();
        harness.as_account("curator.near", NearToken::from_yoctonear(0));
        harness
            .registry
            .set_status(id("bad.testnet"), Status::Blocked, vec![report_id]);
        events.extend(get_logs());
        events.retain(|line| line.starts_with("EVENT_JSON:"));
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../packages/sdk/test/fixtures/registry-events.jsonl");
        comatocard_common::golden::assert_matches(&path, &events);
    }

    #[test]
    fn unknown_accounts_are_clear() {
        let harness = Harness::new();
        assert_eq!(
            harness.registry.get_status(id("anyone.near")),
            Status::Clear
        );
    }

    #[test]
    fn report_is_stored_and_listed() {
        let mut harness = Harness::new();
        let report_id = harness.report("bad.near");
        assert!(
            get_logs()
                .iter()
                .any(|l| l.contains("\"event\":\"report_submitted\""))
        );
        let reports = harness.registry.list_reports(id("bad.near"), None, None);
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].id, report_id);
        assert_eq!(reports[0].reporter_id, id("alice.near"));
    }

    #[test]
    #[should_panic(expected = "to cover storage")]
    fn report_requires_storage_deposit() {
        let mut harness = Harness::new();
        harness.as_account("alice.near", NearToken::from_yoctonear(0));
        harness
            .registry
            .report(id("bad.near"), Category::Scam, "ipfs://evidence".to_owned());
    }

    #[test]
    #[should_panic(expected = "cannot report itself")]
    fn self_reports_are_rejected() {
        let mut harness = Harness::new();
        harness.as_account("bad.near", NearToken::from_millinear(10));
        harness
            .registry
            .report(id("bad.near"), Category::Scam, "ipfs://evidence".to_owned());
    }

    #[test]
    #[should_panic(expected = "evidence_uri must be 1 to 256 bytes")]
    fn evidence_is_required() {
        let mut harness = Harness::new();
        harness.as_account("alice.near", NearToken::from_millinear(10));
        harness
            .registry
            .report(id("bad.near"), Category::Scam, String::new());
    }

    #[test]
    fn curator_blocks_and_clears_with_reports() {
        let mut harness = Harness::new();
        let report_id = harness.report("bad.near");
        harness.as_account("curator.near", NearToken::from_yoctonear(0));
        harness
            .registry
            .set_status(id("bad.near"), Status::Blocked, vec![report_id]);
        assert_eq!(harness.registry.get_status(id("bad.near")), Status::Blocked);
        let record = harness.registry.get_record(id("bad.near")).unwrap();
        assert_eq!(record.curator_id, id("curator.near"));

        harness
            .registry
            .set_status(id("bad.near"), Status::Clear, vec![]);
        assert_eq!(harness.registry.get_status(id("bad.near")), Status::Clear);
        assert!(harness.registry.get_record(id("bad.near")).is_none());
    }

    #[test]
    #[should_panic(expected = "only a curator may set a status")]
    fn only_curators_set_status() {
        let mut harness = Harness::new();
        let report_id = harness.report("bad.near");
        harness
            .registry
            .set_status(id("bad.near"), Status::Blocked, vec![report_id]);
    }

    #[test]
    #[should_panic(expected = "must cite a report")]
    fn blocking_needs_evidence() {
        let mut harness = Harness::new();
        harness.as_account("curator.near", NearToken::from_yoctonear(0));
        harness
            .registry
            .set_status(id("bad.near"), Status::Blocked, vec![]);
    }

    #[test]
    #[should_panic(expected = "report is about another account")]
    fn cited_reports_must_match_the_account() {
        let mut harness = Harness::new();
        let report_id = harness.report("other.near");
        harness.as_account("curator.near", NearToken::from_yoctonear(0));
        harness
            .registry
            .set_status(id("bad.near"), Status::Flagged, vec![report_id]);
    }

    #[test]
    #[should_panic(expected = "only the owner may call this method")]
    fn only_owner_manages_curators() {
        let mut harness = Harness::new();
        harness.as_account("alice.near", NearToken::from_yoctonear(0));
        harness.registry.add_curator(id("alice.near"));
    }
}
