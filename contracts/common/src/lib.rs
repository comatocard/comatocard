//! Shared building blocks of Comatocard contracts.

#[cfg(not(target_arch = "wasm32"))]
pub mod golden {
    //! Golden files shared with `packages/sdk`: contract tests write the exact event lines the
    //! contracts emit, and the SDK tests validate them. A schema change fails one side until both
    //! agree.

    use std::path::Path;

    /// Compares `lines` with the fixture at `path`, or rewrites the fixture when the
    /// `UPDATE_FIXTURES` environment variable is set.
    ///
    /// # Panics
    /// Panics when the fixture differs or cannot be read or written.
    pub fn assert_matches(path: &Path, lines: &[String]) {
        let content = format!("{}\n", lines.join("\n"));
        if std::env::var_os("UPDATE_FIXTURES").is_some() {
            std::fs::write(path, &content).expect("write fixture");
            return;
        }
        let expected = std::fs::read_to_string(path).unwrap_or_default();
        assert!(
            expected == content,
            "{} is out of date, rerun with UPDATE_FIXTURES=1 and review the diff",
            path.display()
        );
    }
}

pub mod events {
    //! NEP-297 envelope used by every Comatocard contract. The schema is documented in
    //! `docs/specs/events.md`.

    use near_sdk::env;
    use near_sdk::serde::Serialize;
    use near_sdk::serde_json;

    pub const STANDARD: &str = "comatocard";
    pub const VERSION: &str = "1.0.0";

    /// The NEP-297 envelope. Typed, so contracts do not pull `serde_json::Value` into the wasm.
    #[derive(Serialize)]
    #[serde(crate = "near_sdk::serde")]
    struct Envelope<'a, T: Serialize> {
        standard: &'static str,
        version: &'static str,
        event: &'a str,
        data: [&'a T; 1],
    }

    /// Formats the log line for `event` with a single `data` object.
    pub fn format(event: &str, data: &impl Serialize) -> String {
        let envelope = Envelope {
            standard: STANDARD,
            version: VERSION,
            event,
            data: [data],
        };
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
        use near_sdk::serde_json::json;

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
