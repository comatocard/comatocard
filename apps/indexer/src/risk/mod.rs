//! Counterparty risk verdicts for `GET /risk/:account`. The response shape is the SDK schema
//! `riskAssessment` that agents validate.

mod collect;
mod rules;

pub use collect::assess_account;
pub use rules::{Assessment, CODE_CHANGE_WINDOW_NS, Reason, Signals, SignalsView, assess};
