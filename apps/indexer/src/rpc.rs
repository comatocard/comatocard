//! Reads from NEAR JSON-RPC: account facts for risk checks and token decimals for the CSV.

use std::collections::HashMap;
use std::future::Future;
use std::sync::Mutex;

use base64::Engine;
use serde_json::{Value, json};

const EMPTY_CODE_HASH: &str = "11111111111111111111111111111111";

/// Account facts read from the chain.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChainAccount {
    pub exists: bool,
    pub code_hash: Option<String>,
}

/// What the API needs from the chain. `None` means the lookup failed.
pub trait Chain: Send + Sync {
    fn account(&self, account_id: &str) -> impl Future<Output = Option<ChainAccount>> + Send;
    /// NEP-148 decimals of a token.
    fn decimals(&self, token: &str) -> impl Future<Output = Option<u32>> + Send;
}

impl<T: Chain> Chain for std::sync::Arc<T> {
    fn account(&self, account_id: &str) -> impl Future<Output = Option<ChainAccount>> + Send {
        T::account(self, account_id)
    }

    fn decimals(&self, token: &str) -> impl Future<Output = Option<u32>> + Send {
        T::decimals(self, token)
    }
}

pub struct Rpc {
    client: reqwest::Client,
    url: String,
    decimals: Mutex<HashMap<String, u32>>,
}

impl Rpc {
    pub fn new(client: reqwest::Client, url: impl Into<String>) -> Self {
        Self {
            client,
            url: url.into(),
            decimals: Mutex::new(HashMap::new()),
        }
    }

    async fn query(&self, params: Value) -> Option<Value> {
        let body = json!({ "jsonrpc": "2.0", "id": "comatocard-indexer", "method": "query", "params": params });
        let response = self.client.post(&self.url).json(&body).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        response.json().await.ok()
    }
}

/// Interprets a `view_account` response; unknown accounts resolve to `exists: false`.
pub fn parse_view_account(body: &Value) -> Option<ChainAccount> {
    if body.pointer("/error/cause/name").and_then(Value::as_str) == Some("UNKNOWN_ACCOUNT") {
        return Some(ChainAccount {
            exists: false,
            code_hash: None,
        });
    }
    let hash = body.pointer("/result/code_hash")?.as_str()?;
    Some(ChainAccount {
        exists: true,
        code_hash: (hash != EMPTY_CODE_HASH).then(|| hash.to_owned()),
    })
}

/// Reads `decimals` from an `ft_metadata` call result.
pub fn parse_ft_metadata(body: &Value) -> Option<u32> {
    let bytes: Vec<u8> = body
        .pointer("/result/result")?
        .as_array()?
        .iter()
        .map(|b| b.as_u64().and_then(|b| u8::try_from(b).ok()))
        .collect::<Option<_>>()?;
    let metadata: Value = serde_json::from_slice(&bytes).ok()?;
    let decimals = u32::try_from(metadata.get("decimals")?.as_u64()?).ok()?;
    (decimals <= 36).then_some(decimals)
}

impl Chain for Rpc {
    async fn account(&self, account_id: &str) -> Option<ChainAccount> {
        let body = self
            .query(json!({ "request_type": "view_account", "finality": "final", "account_id": account_id }))
            .await?;
        parse_view_account(&body)
    }

    async fn decimals(&self, token: &str) -> Option<u32> {
        if let Some(known) = self.decimals.lock().ok()?.get(token) {
            return Some(*known);
        }
        let args = base64::engine::general_purpose::STANDARD.encode("{}");
        let body = self
            .query(json!({
                "request_type": "call_function", "finality": "final", "account_id": token,
                "method_name": "ft_metadata", "args_base64": args,
            }))
            .await?;
        let decimals = parse_ft_metadata(&body)?;
        self.decimals
            .lock()
            .ok()?
            .insert(token.to_owned(), decimals);
        Some(decimals)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_view_account_responses() {
        let contract = json!({ "result": { "code_hash": "CodeV1" } });
        assert_eq!(
            parse_view_account(&contract),
            Some(ChainAccount {
                exists: true,
                code_hash: Some("CodeV1".to_owned())
            })
        );
        let plain = json!({ "result": { "code_hash": EMPTY_CODE_HASH } });
        assert_eq!(parse_view_account(&plain).unwrap().code_hash, None);
        let missing = json!({ "error": { "cause": { "name": "UNKNOWN_ACCOUNT" } } });
        assert!(!parse_view_account(&missing).unwrap().exists);
        assert_eq!(parse_view_account(&json!({ "error": {} })), None);
    }

    #[test]
    fn reads_token_decimals() {
        let bytes: Vec<u8> = br#"{"spec":"ft-1.0.0","decimals":6}"#.to_vec();
        assert_eq!(
            parse_ft_metadata(&json!({ "result": { "result": bytes } })),
            Some(6)
        );
        let huge: Vec<u8> = br#"{"decimals":99}"#.to_vec();
        assert_eq!(
            parse_ft_metadata(&json!({ "result": { "result": huge } })),
            None
        );
        assert_eq!(parse_ft_metadata(&json!({ "error": {} })), None);
    }
}
