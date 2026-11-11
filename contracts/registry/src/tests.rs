//! Contract-level unit tests with a mocked blockchain.
#[cfg(test)]
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::testing_env;
use near_sdk::{AccountId, NearToken};

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
    harness.as_account("curator.near", NearToken::from_millinear(10));
    harness.registry.report(
        id("listed.testnet"),
        Category::Sanctions,
        "sanctions:OFAC-SDN:2026-03-21:SDN-12345".to_owned(),
    );
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

#[test]
fn issue_71_curators_file_sanctions_reports() {
    let mut harness = Harness::new();
    harness.as_account("curator.near", NearToken::from_millinear(10));
    let report_id = harness.registry.report(
        id("listed.testnet"),
        Category::Sanctions,
        "sanctions:UN:2026-01-05".to_owned(),
    );
    assert_eq!(
        harness
            .registry
            .list_reports(id("listed.testnet"), None, None)[0]
            .id,
        report_id
    );
}

#[test]
#[should_panic(expected = "only curators file sanctions reports")]
fn issue_71_others_cannot_file_sanctions_reports() {
    let mut harness = Harness::new();
    harness.as_account("alice.near", NearToken::from_millinear(10));
    harness.registry.report(
        id("listed.testnet"),
        Category::Sanctions,
        "sanctions:UN:2026-01-05".to_owned(),
    );
}

#[test]
#[should_panic(expected = "sanctions evidence must be")]
fn issue_71_sanctions_reports_need_list_evidence() {
    let mut harness = Harness::new();
    harness.as_account("curator.near", NearToken::from_millinear(10));
    harness.registry.report(
        id("listed.testnet"),
        Category::Sanctions,
        "ipfs://evidence".to_owned(),
    );
}
