//! Finalized blocks from neardata, the block source NEAR recommends after NEAR Lake.

mod client;
mod extract;

pub use client::{BlockSource, FREE_TIER_INTERVAL, Neardata, NeardataOptions, retry_after};
pub use extract::{ReceiptLog, Tracked, extract_logs};

use serde::Deserialize;
use serde_json::{Map, Value};

/// The subset of a neardata block the indexer reads. Unknown fields are ignored.
#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct Block {
    pub block: BlockInner,
    pub shards: Vec<Shard>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct BlockInner {
    pub header: Header,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct Header {
    pub height: u64,
    pub timestamp_nanosec: String,
    pub hash: String,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct Shard {
    pub shard_id: u64,
    #[serde(default)]
    pub receipt_execution_outcomes: Option<Vec<ReceiptOutcome>>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct ReceiptOutcome {
    #[serde(default)]
    pub tx_hash: Option<String>,
    pub execution_outcome: ExecutionOutcome,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct ExecutionOutcome {
    pub id: String,
    pub outcome: Outcome,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct Outcome {
    pub executor_id: String,
    pub logs: Vec<String>,
    pub status: Map<String, Value>,
}
