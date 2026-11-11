//! Configuration from environment variables, documented in `.env.example`.

use std::collections::HashMap;
use std::time::Duration;

use near_sdk::AccountId;

/// Head checks while at the chain tip. Testnet makes about 1.7 blocks per second; with one block
/// request each plus a head check every 2 s the indexer stays under the neardata free tier of
/// 3 requests per second.
pub const DEFAULT_POLL_MS: u64 = 2_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub network: String,
    pub factory_id: String,
    pub registry_id: Option<String>,
    pub database_url: String,
    pub start_block: Option<u64>,
    pub neardata_url: String,
    pub neardata_api_key: Option<String>,
    pub neardata_min_interval: Option<Duration>,
    pub rpc_url: String,
    pub port: u16,
    pub log_level: String,
    pub poll_interval: Duration,
}

fn defaults(network: &str) -> Option<(&'static str, &'static str)> {
    match network {
        "testnet" => Some((
            "https://testnet.neardata.xyz",
            "https://rpc.testnet.near.org",
        )),
        "mainnet" => Some((
            "https://mainnet.neardata.xyz",
            "https://rpc.mainnet.near.org",
        )),
        _ => None,
    }
}

fn number<T: std::str::FromStr>(
    value: Option<&str>,
    key: &str,
    errors: &mut Vec<String>,
) -> Option<T> {
    value.and_then(|v| {
        v.parse()
            .map_err(|_| errors.push(format!("{key}: expected a non-negative integer")))
            .ok()
    })
}

impl Config {
    /// Reads the configuration; empty values count as unset.
    ///
    /// # Errors
    /// Lists every invalid or missing variable.
    pub fn from_env(env: &HashMap<String, String>) -> Result<Self, String> {
        let get = |key: &str| env.get(key).map(|v| v.trim()).filter(|v| !v.is_empty());
        let mut errors = Vec::new();
        let account = |key: &str, errors: &mut Vec<String>| {
            let parsed = get(key).map(str::parse::<AccountId>)?;
            if parsed.is_err() {
                errors.push(format!("{key}: invalid account id"));
            }
            parsed.ok().map(|id| id.to_string())
        };
        let network = get("NETWORK").unwrap_or("testnet").to_owned();
        let Some((neardata, rpc)) = defaults(&network) else {
            return Err(format!(
                "NETWORK: expected testnet or mainnet, got {network}"
            ));
        };
        let factory_id = account("FACTORY_ID", &mut errors);
        if get("FACTORY_ID").is_none() {
            errors.push("FACTORY_ID: required".to_owned());
        }
        let registry_id = account("REGISTRY_ID", &mut errors);
        let database_url = get("DATABASE_URL").map(str::to_owned);
        if database_url.is_none() {
            errors.push("DATABASE_URL: required".to_owned());
        }
        let start_block = number(get("START_BLOCK"), "START_BLOCK", &mut errors);
        let min_interval: Option<u64> = number(
            get("NEARDATA_MIN_INTERVAL_MS"),
            "NEARDATA_MIN_INTERVAL_MS",
            &mut errors,
        );
        let port = number(get("PORT"), "PORT", &mut errors).unwrap_or(4000);
        let poll: u64 = number(get("POLL_INTERVAL_MS"), "POLL_INTERVAL_MS", &mut errors)
            .unwrap_or(DEFAULT_POLL_MS);
        let log_level = get("LOG_LEVEL").unwrap_or("info").to_owned();
        if !["error", "warn", "info", "debug", "trace"].contains(&log_level.as_str()) {
            errors.push(format!("LOG_LEVEL: unknown level {log_level}"));
        }
        if !errors.is_empty() {
            return Err(format!("invalid configuration\n{}", errors.join("\n")));
        }
        Ok(Self {
            network,
            factory_id: factory_id.unwrap_or_default(),
            registry_id,
            database_url: database_url.unwrap_or_default(),
            start_block,
            neardata_url: get("NEARDATA_URL").unwrap_or(neardata).to_owned(),
            neardata_api_key: get("NEARDATA_API_KEY").map(str::to_owned),
            neardata_min_interval: min_interval.map(Duration::from_millis),
            rpc_url: get("RPC_URL").unwrap_or(rpc).to_owned(),
            port,
            log_level,
            poll_interval: Duration::from_millis(poll.max(1)),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect()
    }

    #[test]
    fn applies_network_defaults() {
        let config = Config::from_env(&env(&[
            ("FACTORY_ID", "factory.comatocard.testnet"),
            ("DATABASE_URL", "postgres://localhost/x"),
            ("REGISTRY_ID", ""),
        ]))
        .unwrap();
        assert_eq!(config.neardata_url, "https://testnet.neardata.xyz");
        assert_eq!(config.rpc_url, "https://rpc.testnet.near.org");
        assert_eq!(config.registry_id, None);
        assert_eq!(config.port, 4000);
        assert_eq!(config.neardata_min_interval, None);
    }

    #[test]
    fn reads_overrides() {
        let config = Config::from_env(&env(&[
            ("NETWORK", "mainnet"),
            ("FACTORY_ID", "factory.near"),
            ("DATABASE_URL", "postgres://db/x"),
            ("START_BLOCK", "42"),
            ("NEARDATA_MIN_INTERVAL_MS", "0"),
            ("PORT", "8080"),
        ]))
        .unwrap();
        assert_eq!(config.rpc_url, "https://rpc.mainnet.near.org");
        assert_eq!(config.start_block, Some(42));
        assert_eq!(config.neardata_min_interval, Some(Duration::ZERO));
        assert_eq!(config.port, 8080);
    }

    #[test]
    fn lists_every_problem() {
        let error =
            Config::from_env(&env(&[("START_BLOCK", "-1"), ("LOG_LEVEL", "loud")])).unwrap_err();
        for key in ["FACTORY_ID", "DATABASE_URL", "START_BLOCK", "LOG_LEVEL"] {
            assert!(error.contains(key), "{error}");
        }
        assert!(Config::from_env(&env(&[("NETWORK", "devnet")])).is_err());
    }
}
