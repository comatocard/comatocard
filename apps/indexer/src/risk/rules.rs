//! Verdict rules. Pure, so every rule is unit tested.

use serde::Serialize;

/// A contract whose code changed within this window is treated with caution.
pub const CODE_CHANGE_WINDOW_NS: u128 = 7 * 24 * 3_600 * 1_000_000_000;

/// Facts about a counterparty that the verdict is derived from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signals {
    pub account_id: String,
    pub registry_status: String,
    pub report_count: i64,
    /// `None` when the chain lookup failed.
    pub exists: Option<bool>,
    pub is_contract: Option<bool>,
    /// When the current contract code was first observed, if a different code was seen before.
    pub code_changed_at: Option<u128>,
    /// Settled payments from the asking vault, `None` when no vault was given.
    pub prior_payments: Option<i64>,
    /// First settled payment to this account by any indexed vault.
    pub first_paid_at: Option<u128>,
    /// Sanctions lists that curators cited for this account, as `LIST (YYYY-MM-DD)`.
    pub sanctions: Vec<String>,
    pub now: u128,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Reason {
    pub code: &'static str,
    pub level: &'static str,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SignalsView {
    pub registry_status: String,
    pub report_count: i64,
    pub exists: Option<bool>,
    pub is_contract: Option<bool>,
    pub code_changed_at: Option<String>,
    pub prior_payments: Option<i64>,
    pub first_paid_at: Option<String>,
    pub sanctions_lists: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Assessment {
    pub account_id: String,
    pub verdict: &'static str,
    pub reasons: Vec<Reason>,
    pub signals: SignalsView,
}

/// Turns signals into a verdict. Pure, so every rule is unit tested.
pub fn assess(s: &Signals) -> Assessment {
    let mut reasons = Vec::new();
    let mut add = |code, level, detail: String| {
        reasons.push(Reason {
            code,
            level,
            detail,
        });
    };
    if !s.sanctions.is_empty() {
        add(
            "sanctions_listed",
            "block",
            format!("listed on {}", s.sanctions.join(", ")),
        );
    }
    match s.registry_status.as_str() {
        "blocked" => add(
            "registry_blocked",
            "block",
            "a registry curator blocked this account".into(),
        ),
        "flagged" => add(
            "registry_flagged",
            "warn",
            "a registry curator flagged this account".into(),
        ),
        _ if s.report_count > 0 => add(
            "reported",
            "info",
            format!("{} report(s) without a curator decision", s.report_count),
        ),
        _ => {}
    }
    match s.exists {
        Some(false) => add(
            "account_missing",
            "warn",
            "the account does not exist on chain".into(),
        ),
        None => add(
            "chain_lookup_failed",
            "info",
            "account details could not be read from the chain".into(),
        ),
        Some(true) => {}
    }
    if s.is_contract == Some(true)
        && s.code_changed_at
            .is_some_and(|at| s.now.saturating_sub(at) < CODE_CHANGE_WINDOW_NS)
    {
        add(
            "code_changed_recently",
            "warn",
            "the contract code changed in the last 7 days".into(),
        );
    }
    if s.prior_payments == Some(0) {
        add(
            "first_payment",
            "info",
            "this vault has never paid this account".into(),
        );
    }
    if s.first_paid_at.is_none() {
        add(
            "never_paid",
            "info",
            "no indexed vault has paid this account before".into(),
        );
    }
    let verdict = if reasons.iter().any(|r| r.level == "block") {
        "block"
    } else if reasons.iter().any(|r| r.level == "warn") {
        "warn"
    } else {
        "allow"
    };
    Assessment {
        account_id: s.account_id.clone(),
        verdict,
        reasons,
        signals: SignalsView {
            registry_status: s.registry_status.clone(),
            report_count: s.report_count,
            exists: s.exists,
            is_contract: s.is_contract,
            code_changed_at: s.code_changed_at.map(|v| v.to_string()),
            prior_payments: s.prior_payments,
            first_paid_at: s.first_paid_at.map(|v| v.to_string()),
            sanctions_lists: s.sanctions.clone(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u128 = 1_800_000_000_000_000_000;

    fn clean() -> Signals {
        Signals {
            account_id: "shop.testnet".to_owned(),
            registry_status: "clear".to_owned(),
            report_count: 0,
            exists: Some(true),
            is_contract: Some(false),
            code_changed_at: None,
            prior_payments: Some(3),
            first_paid_at: Some(NOW - 1),
            sanctions: Vec::new(),
            now: NOW,
        }
    }

    fn codes(s: &Signals) -> Vec<&'static str> {
        assess(s).reasons.iter().map(|r| r.code).collect()
    }

    #[test]
    fn allows_a_known_clean_account() {
        let result = assess(&clean());
        assert_eq!(result.verdict, "allow");
        assert!(result.reasons.is_empty());
    }

    #[test]
    fn issue_71_sanctions_block_and_name_the_list() {
        let listed = Signals {
            sanctions: vec!["OFAC-SDN (2026-03-21)".into()],
            ..clean()
        };
        let result = assess(&listed);
        assert_eq!(result.verdict, "block");
        assert_eq!(result.reasons[0].code, "sanctions_listed");
        assert_eq!(result.reasons[0].detail, "listed on OFAC-SDN (2026-03-21)");
        assert_eq!(result.signals.sanctions_lists, ["OFAC-SDN (2026-03-21)"]);
    }

    #[test]
    fn registry_decisions_win() {
        let blocked = Signals {
            registry_status: "blocked".into(),
            report_count: 2,
            ..clean()
        };
        assert_eq!(assess(&blocked).verdict, "block");
        assert_eq!(codes(&blocked), ["registry_blocked"]);
        let flagged = Signals {
            registry_status: "flagged".into(),
            ..clean()
        };
        assert_eq!(assess(&flagged).verdict, "warn");
        let reported = Signals {
            report_count: 2,
            ..clean()
        };
        assert_eq!(assess(&reported).verdict, "allow");
        assert_eq!(
            assess(&reported).reasons[0].detail,
            "2 report(s) without a curator decision"
        );
    }

    #[test]
    fn chain_facts_and_history() {
        let missing = Signals {
            exists: Some(false),
            ..clean()
        };
        assert_eq!(assess(&missing).verdict, "warn");
        let unknown = Signals {
            exists: None,
            is_contract: None,
            ..clean()
        };
        assert_eq!(codes(&unknown), ["chain_lookup_failed"]);
        let fresh = Signals {
            is_contract: Some(true),
            code_changed_at: Some(NOW - 1),
            ..clean()
        };
        assert_eq!(assess(&fresh).verdict, "warn");
        let old = Signals {
            is_contract: Some(true),
            code_changed_at: Some(NOW - CODE_CHANGE_WINDOW_NS),
            ..clean()
        };
        assert_eq!(assess(&old).verdict, "allow");
        let new = Signals {
            prior_payments: Some(0),
            first_paid_at: None,
            ..clean()
        };
        assert_eq!(codes(&new), ["first_payment", "never_paid"]);
        assert_eq!(assess(&new).signals.first_paid_at, None);
    }
}
