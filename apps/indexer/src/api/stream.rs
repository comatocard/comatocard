//! `GET /stream?vault=` or `?merchant=`: pushes each committed event that matches the filter.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use tokio::sync::broadcast::error::RecvError;

use super::{Params, Shared};
use crate::bus::StreamEvent;
use crate::rpc::Chain;

/// Which events a subscriber receives. An empty filter receives nothing.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Filter {
    pub vault: Option<String>,
    pub merchant: Option<String>,
}

impl Filter {
    pub fn matches(&self, event: &StreamEvent) -> bool {
        if let Some(vault) = &self.vault {
            return &event.contract_id == vault;
        }
        self.merchant.as_deref().is_some_and(|merchant| {
            event.data.get("merchant").and_then(|m| m.as_str()) == Some(merchant)
        })
    }
}

pub async fn stream<C: Chain>(
    State(state): Shared<C>,
    Query(params): Params,
    upgrade: WebSocketUpgrade,
) -> Response {
    let filter = Filter {
        vault: params.get("vault").cloned(),
        merchant: params.get("merchant").cloned(),
    };
    let events = state.bus.subscribe();
    upgrade.on_upgrade(move |socket| forward(socket, events, filter))
}

async fn forward(
    mut socket: WebSocket,
    mut events: tokio::sync::broadcast::Receiver<StreamEvent>,
    filter: Filter,
) {
    loop {
        tokio::select! {
            received = events.recv() => match received {
                Ok(event) if filter.matches(&event) => {
                    let Ok(text) = serde_json::to_string(&event) else { continue };
                    if socket.send(Message::Text(text.into())).await.is_err() {
                        return;
                    }
                }
                Ok(_) | Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => return,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Close(_)) | Err(_)) | None => return,
                Some(Ok(_)) => {}
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn event(contract: &str, data: serde_json::Value) -> StreamEvent {
        StreamEvent {
            contract_id: contract.to_owned(),
            event: "payment_settled".to_owned(),
            data,
            block_height: 1,
            tx_hash: None,
            timestamp: "1".to_owned(),
        }
    }

    #[test]
    fn filters_by_vault_or_merchant() {
        let paid = event("v.factory.testnet", json!({ "merchant": "shop.testnet" }));
        let by_vault = Filter {
            vault: Some("v.factory.testnet".into()),
            merchant: None,
        };
        let by_merchant = Filter {
            vault: None,
            merchant: Some("shop.testnet".into()),
        };
        assert!(by_vault.matches(&paid));
        assert!(by_merchant.matches(&paid));
        assert!(!Filter::default().matches(&paid));
        assert!(!by_merchant.matches(&event("v.factory.testnet", json!({ "payment_id": 1 }))));
    }
}
