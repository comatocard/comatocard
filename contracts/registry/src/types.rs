//! Data stored by the registry and returned by its views.

use near_sdk::json_types::U64;
use near_sdk::{AccountId, near};

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
    /// The account is on an official sanctions list. Only curators file these, with evidence in
    /// the form `sanctions:<LIST>:<YYYY-MM-DD>[:<reference>]`, see [`SANCTIONS_LISTS`].
    Sanctions,
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
