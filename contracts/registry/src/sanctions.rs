//! Sanctions evidence. A sanctions report names the list and the listing date in its evidence,
//! `sanctions:<LIST>:<YYYY-MM-DD>[:<reference>]`, so a verdict can always be traced to an official
//! source. The registry is not a sanctions list itself; curators import entries from these lists.

/// Lists a sanctions report may cite: US OFAC SDN, the UN Security Council consolidated list,
/// the EU consolidated list, the UK OFSI list, and Indonesia's terrorism (DTTOT) and
/// proliferation financing (DPPSPM) lists.
pub const SANCTIONS_LISTS: [&str; 6] = ["OFAC-SDN", "UN", "EU", "UK-OFSI", "DTTOT", "DPPSPM"];

/// Whether `evidence` names a known list and a listing date: `sanctions:<LIST>:<YYYY-MM-DD>`,
/// optionally followed by `:<reference>`.
pub fn is_sanctions_evidence(evidence: &str) -> bool {
    let mut parts = evidence.splitn(4, ':');
    let (Some("sanctions"), Some(list), Some(date)) = (parts.next(), parts.next(), parts.next())
    else {
        return false;
    };
    let bytes = date.as_bytes();
    let date_ok = bytes.len() == 10
        && bytes.iter().enumerate().all(|(i, b)| {
            if i == 4 || i == 7 {
                *b == b'-'
            } else {
                b.is_ascii_digit()
            }
        });
    SANCTIONS_LISTS.contains(&list) && date_ok && parts.next().is_none_or(|r| !r.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_71_sanctions_evidence_names_a_list_and_a_date() {
        assert!(is_sanctions_evidence("sanctions:OFAC-SDN:2026-03-21"));
        assert!(is_sanctions_evidence(
            "sanctions:DTTOT:2025-07-03:DTTOT-2025-17"
        ));
        for bad in [
            "sanctions:OFAC:2026-03-21",
            "sanctions:UN:21-03-2026",
            "sanctions:UN:2026-3-21x",
            "sanctions:UN",
            "sanctions:UN:2026-03-21:",
            "ipfs://evidence",
        ] {
            assert!(!is_sanctions_evidence(bad), "{bad}");
        }
    }
}
