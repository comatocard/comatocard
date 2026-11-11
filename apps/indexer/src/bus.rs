//! In-process fan-out from the ingestion loop to WebSocket connections.

use serde::Serialize;
use serde_json::Value;
use tokio::sync::broadcast;

/// An event as pushed to WebSocket subscribers after its block is committed.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct StreamEvent {
    pub contract_id: String,
    pub event: String,
    pub data: Value,
    pub block_height: u64,
    pub tx_hash: Option<String>,
    pub timestamp: String,
}

/// Subscribers that fall this far behind skip the oldest events instead of blocking ingestion.
const CAPACITY: usize = 1_024;

#[derive(Clone)]
pub struct EventBus(broadcast::Sender<StreamEvent>);

impl Default for EventBus {
    fn default() -> Self {
        Self(broadcast::channel(CAPACITY).0)
    }
}

impl EventBus {
    pub fn publish(&self, event: StreamEvent) {
        // No subscribers is the normal idle state.
        let _ = self.0.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<StreamEvent> {
        self.0.subscribe()
    }
}
