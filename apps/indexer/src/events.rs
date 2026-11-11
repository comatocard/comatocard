//! Comatocard NEP-297 events. Payload types reuse the contract crates (`vault`, `registry`), so
//! the indexer and the contracts share one definition; `docs/specs/events.md` documents them and
//! the golden fixtures in `packages/sdk/test/fixtures` pin the exact JSON.

use near_sdk::json_types::U128;
use near_sdk::{AccountId, PublicKey};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use vault::types::{CardKind, FailureCause, Policy, QueueCause, RejectReason};

/// NEP-297 standard name of every Comatocard event.
pub const EVENT_STANDARD: &str = "comatocard";
/// Major version of the event schema this indexer understands.
pub const EVENT_MAJOR_VERSION: u64 = 1;
/// Prefix of NEP-297 log lines.
pub const EVENT_LOG_PREFIX: &str = "EVENT_JSON:";

macro_rules! payloads {
    ($($name:ident { $($field:ident : $ty:ty),* $(,)? })*) => {
        $(
            #[derive(Debug, Clone, Deserialize)]
            #[serde(deny_unknown_fields)]
            pub struct $name { $(pub $field: $ty),* }
        )*
    };
}

payloads! {
    VaultCodePublished { code_hash: String, code_version: u64 }
    VaultCreated { vault_id: AccountId, owner_id: AccountId, code_version: u64 }
    CardCreated { card_id: u64, public_key: PublicKey, label: String, kind: CardKind, policy: Value }
    CardPolicyUpdated { card_id: u64, policy: Value }
    CardRef { card_id: u64 }
    CardKeyRotated { card_id: u64, old_public_key: Option<PublicKey>, new_public_key: PublicKey }
    CardTransferred { card_id: u64, old_holder: AccountId, new_holder: AccountId }
    CardKeyRejected { card_id: u64, public_key: PublicKey }
    ApproverSet { account_id: AccountId, max_amount: Option<U128> }
    Deposit { token: AccountId, sender_id: AccountId, amount: U128 }
    Withdrawal { token: AccountId, receiver_id: AccountId, amount: U128, success: bool }
    PaymentSubmitted {
        payment_id: u64, card_id: u64, merchant: AccountId, token: AccountId, amount: U128,
        memo: Option<String>, reference: Option<String>,
    }
    PaymentQueued {
        payment_id: u64, card_id: u64, merchant: AccountId, token: AccountId, amount: U128,
        memo: Option<String>, reference: Option<String>, cause: QueueCause,
    }
    PaymentDecision { payment_id: u64, approver_id: AccountId }
    PaymentRef { payment_id: u64 }
    PaymentSettled {
        payment_id: u64, card_id: u64, merchant: AccountId, token: AccountId, amount: U128,
        reference: Option<String>,
    }
    PaymentFailed {
        payment_id: u64, card_id: u64, merchant: AccountId, token: AccountId, amount: U128,
        cause: FailureCause,
    }
    PaymentRejected {
        card_id: u64, merchant: AccountId, token: AccountId, amount: U128, reason: RejectReason,
        reference: Option<String>,
    }
    OwnerRef { owner_id: AccountId }
    ReportSubmitted {
        report_id: u64, account_id: AccountId, reporter_id: AccountId,
        category: registry::Category, evidence_uri: String,
    }
    StatusChanged {
        account_id: AccountId, status: registry::Status, curator_id: AccountId,
        report_ids: Vec<u64>,
    }
}

/// A validated event payload.
#[derive(Debug, Clone)]
pub enum EventData {
    VaultCodePublished(VaultCodePublished),
    VaultCreated(VaultCreated),
    CardCreated(CardCreated),
    CardPolicyUpdated(CardPolicyUpdated),
    CardFrozen(CardRef),
    CardUnfrozen(CardRef),
    CardRevoked(CardRef),
    CardKeyRotated(CardKeyRotated),
    CardTransferred(CardTransferred),
    CardKeyRejected(CardKeyRejected),
    ApproverSet(ApproverSet),
    Deposit(Deposit),
    Withdrawal(Withdrawal),
    PaymentSubmitted(PaymentSubmitted),
    PaymentQueued(PaymentQueued),
    PaymentApproved(PaymentDecision),
    PaymentDeclined(PaymentDecision),
    PaymentExpired(PaymentRef),
    PaymentSettled(PaymentSettled),
    PaymentFailed(PaymentFailed),
    PaymentRejected(PaymentRejected),
    OwnerProposed(OwnerRef),
    OwnerChanged(OwnerRef),
    ReportSubmitted(ReportSubmitted),
    StatusChanged(StatusChanged),
}

/// Every event name the indexer accepts, in `docs/specs/events.md` order.
pub const EVENT_NAMES: [&str; 25] = [
    "vault_code_published",
    "vault_created",
    "card_created",
    "card_policy_updated",
    "card_frozen",
    "card_unfrozen",
    "card_revoked",
    "card_key_rotated",
    "card_transferred",
    "card_key_rejected",
    "approver_set",
    "deposit",
    "withdrawal",
    "payment_submitted",
    "payment_queued",
    "payment_approved",
    "payment_declined",
    "payment_expired",
    "payment_settled",
    "payment_failed",
    "payment_rejected",
    "owner_proposed",
    "owner_changed",
    "report_submitted",
    "status_changed",
];

/// A validated Comatocard event: its name, NEP-297 version, typed payload and the payload as
/// logged, which is what the database and the stream keep.
#[derive(Debug, Clone)]
pub struct Event {
    pub name: String,
    pub version: String,
    pub data: EventData,
    pub raw: Value,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ParseError {
    /// The line is not a NEP-297 log.
    NotAnEvent,
    /// A NEP-297 event of another standard, for example `nep171`.
    OtherStandard,
    /// A Comatocard event that does not match the schema; the indexer dead-letters it.
    Invalid(String),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    standard: String,
    version: String,
    event: String,
    data: (Value,),
}

fn typed<T: DeserializeOwned>(event: &str, data: &Value) -> Result<T, ParseError> {
    T::deserialize(data).map_err(|error| ParseError::Invalid(format!("{event}: {error}")))
}

fn semver_major(version: &str) -> Option<u64> {
    let parts: Vec<&str> = version.split('.').collect();
    let numeric = parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()));
    numeric.then(|| parts[0].parse().ok()).flatten()
}

fn payload(event: &str, data: &Value) -> Result<EventData, ParseError> {
    use EventData as E;
    Ok(match event {
        "vault_code_published" => {
            let value: VaultCodePublished = typed(event, data)?;
            if value.code_hash.len() < 32 {
                return Err(ParseError::Invalid(format!(
                    "{event}: code_hash is too short"
                )));
            }
            E::VaultCodePublished(value)
        }
        "vault_created" => E::VaultCreated(typed(event, data)?),
        "card_created" => {
            let value: CardCreated = typed(event, data)?;
            typed::<Policy>(event, &value.policy)?;
            E::CardCreated(value)
        }
        "card_policy_updated" => {
            let value: CardPolicyUpdated = typed(event, data)?;
            typed::<Policy>(event, &value.policy)?;
            E::CardPolicyUpdated(value)
        }
        "card_frozen" => E::CardFrozen(typed(event, data)?),
        "card_unfrozen" => E::CardUnfrozen(typed(event, data)?),
        "card_revoked" => E::CardRevoked(typed(event, data)?),
        "card_key_rotated" => E::CardKeyRotated(typed(event, data)?),
        "card_transferred" => E::CardTransferred(typed(event, data)?),
        "card_key_rejected" => E::CardKeyRejected(typed(event, data)?),
        "approver_set" => E::ApproverSet(typed(event, data)?),
        "deposit" => E::Deposit(typed(event, data)?),
        "withdrawal" => E::Withdrawal(typed(event, data)?),
        "payment_submitted" => E::PaymentSubmitted(typed(event, data)?),
        "payment_queued" => E::PaymentQueued(typed(event, data)?),
        "payment_approved" => E::PaymentApproved(typed(event, data)?),
        "payment_declined" => E::PaymentDeclined(typed(event, data)?),
        "payment_expired" => E::PaymentExpired(typed(event, data)?),
        "payment_settled" => E::PaymentSettled(typed(event, data)?),
        "payment_failed" => E::PaymentFailed(typed(event, data)?),
        "payment_rejected" => E::PaymentRejected(typed(event, data)?),
        "owner_proposed" => E::OwnerProposed(typed(event, data)?),
        "owner_changed" => E::OwnerChanged(typed(event, data)?),
        "report_submitted" => {
            let value: ReportSubmitted = typed(event, data)?;
            if value.evidence_uri.is_empty() {
                return Err(ParseError::Invalid(format!(
                    "{event}: evidence_uri is empty"
                )));
            }
            E::ReportSubmitted(value)
        }
        "status_changed" => E::StatusChanged(typed(event, data)?),
        other => return Err(ParseError::Invalid(format!("unknown event {other}"))),
    })
}

/// Parses one log line. Lines without the NEP-297 prefix and events of other standards are
/// skipped; Comatocard events that do not match the schema are reported as invalid.
///
/// # Errors
/// Returns why the line is not a valid Comatocard event.
pub fn parse_event_log(line: &str) -> Result<Event, ParseError> {
    let body = line
        .strip_prefix(EVENT_LOG_PREFIX)
        .ok_or(ParseError::NotAnEvent)?;
    let json: Value =
        serde_json::from_str(body).map_err(|_| ParseError::Invalid("malformed JSON".to_owned()))?;
    if json.is_object() && json.get("standard").and_then(Value::as_str) != Some(EVENT_STANDARD) {
        return Err(ParseError::OtherStandard);
    }
    let envelope = Envelope::deserialize(&json)
        .map_err(|error| ParseError::Invalid(format!("envelope: {error}")))?;
    if envelope.standard != EVENT_STANDARD {
        return Err(ParseError::OtherStandard);
    }
    if semver_major(&envelope.version) != Some(EVENT_MAJOR_VERSION) {
        return Err(ParseError::Invalid(format!(
            "unsupported version {}",
            envelope.version
        )));
    }
    let raw = envelope.data.0;
    let data = payload(&envelope.event, &raw)?;
    Ok(Event {
        name: envelope.event,
        version: envelope.version,
        data,
        raw,
    })
}

/// The snake case JSON name of a contract enum, for database columns.
pub fn wire_name<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::path::Path;

    use super::*;

    fn fixture_lines() -> Vec<String> {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/sdk/test/fixtures");
        [
            "vault-events.jsonl",
            "registry-events.jsonl",
            "factory-events.jsonl",
        ]
        .iter()
        .flat_map(|file| {
            std::fs::read_to_string(dir.join(file))
                .expect("fixture")
                .lines()
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .collect()
    }

    #[test]
    fn parses_every_line_the_contracts_emit() {
        let mut seen = BTreeSet::new();
        for line in fixture_lines() {
            match parse_event_log(&line) {
                Ok(event) => {
                    seen.insert(event.name);
                }
                Err(ParseError::OtherStandard) => assert!(line.contains("\"nep171\""), "{line}"),
                Err(error) => panic!("{line}: {error:?}"),
            }
        }
        let expected: BTreeSet<String> = EVENT_NAMES.iter().map(|n| (*n).to_owned()).collect();
        assert_eq!(seen, expected, "the fixtures cover every event");
    }

    #[test]
    fn skips_other_lines_and_rejects_bad_events() {
        assert_eq!(
            parse_event_log("plain log").err(),
            Some(ParseError::NotAnEvent)
        );
        assert_eq!(
            parse_event_log(
                r#"EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[]}"#
            )
            .err(),
            Some(ParseError::OtherStandard)
        );
        assert!(matches!(
            parse_event_log("EVENT_JSON:{"),
            Err(ParseError::Invalid(_))
        ));
        let envelope = |version: &str, event: &str, data: &str| {
            format!(
                r#"EVENT_JSON:{{"standard":"comatocard","version":"{version}","event":"{event}","data":[{data}]}}"#
            )
        };
        for line in [
            envelope("2.0.0", "payment_expired", r#"{"payment_id":1}"#),
            envelope("1.0", "payment_expired", r#"{"payment_id":1}"#),
            envelope("1.0.0", "payment_lost", r#"{"payment_id":1}"#),
            envelope("1.0.0", "payment_expired", r#"{"payment_id":"bad"}"#),
            envelope(
                "1.0.0",
                "payment_expired",
                r#"{"payment_id":1,"extra":true}"#,
            ),
            envelope(
                "1.0.0",
                "deposit",
                r#"{"token":"NOT VALID","sender_id":"a.testnet","amount":"1"}"#,
            ),
        ] {
            assert!(
                matches!(parse_event_log(&line), Err(ParseError::Invalid(_))),
                "{line}"
            );
        }
    }

    #[test]
    fn names_contract_enums_in_snake_case() {
        assert_eq!(wire_name(&RejectReason::PerTxLimit), "per_tx_limit");
        assert_eq!(wire_name(&registry::Status::Blocked), "blocked");
    }
}
