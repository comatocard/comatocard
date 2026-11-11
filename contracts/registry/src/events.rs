//! Registry events in the Comatocard NEP-297 standard, documented in `docs/specs/events.md`.

use near_sdk::AccountId;
use near_sdk::serde::Serialize;

use crate::types::{Category, ReportId, Status};

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(crate) struct ReportSubmitted<'a> {
    pub(crate) report_id: ReportId,
    pub(crate) account_id: &'a AccountId,
    pub(crate) reporter_id: &'a AccountId,
    pub(crate) category: Category,
    pub(crate) evidence_uri: &'a str,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub(crate) struct StatusChanged<'a> {
    pub(crate) account_id: &'a AccountId,
    pub(crate) status: Status,
    pub(crate) curator_id: &'a AccountId,
    pub(crate) report_ids: &'a [ReportId],
}
