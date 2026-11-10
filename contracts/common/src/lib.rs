//! Shared building blocks of Comatocard contracts.

pub mod events {
    //! NEP-297 envelope used by every Comatocard contract. The schema is documented in
    //! `docs/specs/events.md`.

    use near_sdk::env;
    use near_sdk::serde::Serialize;
    use near_sdk::serde_json::{self, json};

    pub const STANDARD: &str = "comatocard";
    pub const VERSION: &str = "1.0.0";

    /// Formats the log line for `event` with a single `data` object.
    pub fn format(event: &str, data: &impl Serialize) -> String {
        let envelope = json!({
            "standard": STANDARD,
            "version": VERSION,
            "event": event,
            "data": [data],
        });
        format!(
            "EVENT_JSON:{}",
            serde_json::to_string(&envelope).unwrap_or_default()
        )
    }

    /// Logs `event` in the NEP-297 envelope.
    pub fn emit(event: &str, data: &impl Serialize) {
        env::log_str(&format(event, data));
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn envelope_matches_golden_output() {
            assert_eq!(
                format("payment_expired", &json!({ "payment_id": 7 })),
                r#"EVENT_JSON:{"standard":"comatocard","version":"1.0.0","event":"payment_expired","data":[{"payment_id":7}]}"#
            );
        }
    }
}
