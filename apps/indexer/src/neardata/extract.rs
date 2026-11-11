//! Picks the logs of tracked contracts out of a block.

use super::Block;

/// One log line of a successful receipt, with its position in the chain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReceiptLog {
    pub block_height: u64,
    pub block_timestamp: String,
    pub receipt_id: String,
    pub log_index: u32,
    pub tx_hash: Option<String>,
    pub executor_id: String,
    pub line: String,
}

/// The factory, the registry and every direct sub-account of the factory (the vaults).
#[derive(Debug, Clone)]
pub struct Tracked {
    factory: String,
    registry: Option<String>,
    suffix: String,
}

impl Tracked {
    pub fn new(factory: &str, registry: Option<&str>) -> Self {
        Self {
            factory: factory.to_owned(),
            registry: registry.map(str::to_owned),
            suffix: format!(".{factory}"),
        }
    }

    pub fn contains(&self, account_id: &str) -> bool {
        account_id == self.factory
            || self.registry.as_deref() == Some(account_id)
            || account_id
                .strip_suffix(&self.suffix)
                .is_some_and(|name| !name.is_empty() && !name.contains('.'))
    }
}

/// Logs of successful receipts executed by tracked accounts, in execution order. Failed receipts
/// are rolled back on chain, so their logs describe nothing that happened.
pub fn extract_logs(block: &Block, tracked: &Tracked) -> Vec<ReceiptLog> {
    let header = &block.block.header;
    let mut logs = Vec::new();
    for shard in &block.shards {
        for receipt in shard.receipt_execution_outcomes.iter().flatten() {
            let outcome = &receipt.execution_outcome.outcome;
            let succeeded = outcome.status.contains_key("SuccessValue")
                || outcome.status.contains_key("SuccessReceiptId");
            if !succeeded || !tracked.contains(&outcome.executor_id) {
                continue;
            }
            for (index, line) in outcome.logs.iter().enumerate() {
                logs.push(ReceiptLog {
                    block_height: header.height,
                    block_timestamp: header.timestamp_nanosec.clone(),
                    receipt_id: receipt.execution_outcome.id.clone(),
                    log_index: u32::try_from(index).unwrap_or(u32::MAX),
                    tx_hash: receipt.tx_hash.clone(),
                    executor_id: outcome.executor_id.clone(),
                    line: line.clone(),
                });
            }
        }
    }
    logs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracks_factory_registry_and_direct_vaults_only() {
        let tracked = Tracked::new("factory.testnet", Some("registry.testnet"));
        assert!(tracked.contains("factory.testnet"));
        assert!(tracked.contains("registry.testnet"));
        assert!(tracked.contains("alice.factory.testnet"));
        assert!(!tracked.contains("deep.alice.factory.testnet"));
        assert!(!tracked.contains(".factory.testnet"));
        assert!(!tracked.contains("xfactory.testnet"));
        assert!(!Tracked::new("factory.testnet", None).contains("registry.testnet"));
    }

    #[test]
    fn reads_a_recorded_testnet_block() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/neardata-testnet-block.json"
        );
        let block: Block = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let all = Tracked::new("testnet", None);
        let logs = extract_logs(&block, &all);
        assert!(
            logs.iter()
                .all(|log| log.block_height == block.block.header.height)
        );
    }
}
