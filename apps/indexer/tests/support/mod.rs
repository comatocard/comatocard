//! Test support: a real Postgres in a container, neardata-shaped blocks and the scenario the
//! TypeScript indexer was tested with, so its API snapshots stay the regression baseline.

#![allow(dead_code, reason = "each test binary uses a different subset")]

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};

use comatocard_indexer::MIGRATOR;
use comatocard_indexer::neardata::{Block, BlockSource, Tracked};
use comatocard_indexer::rpc::{Chain, ChainAccount};
use serde_json::{Value, json};
use sqlx::PgPool;
use testcontainers_modules::postgres::Postgres;
use testcontainers_modules::testcontainers::runners::SyncRunner;
use testcontainers_modules::testcontainers::{Container, ImageExt};

pub const FACTORY: &str = "factory.comatocard.testnet";
pub const REGISTRY: &str = "registry.comatocard.testnet";
pub const VAULT: &str = "alice.factory.comatocard.testnet";
pub const TOKEN: &str = "tusd.comatocard.testnet";

pub fn tracked() -> Tracked {
    Tracked::new(FACTORY, Some(REGISTRY))
}

/// One container per test binary, started on a plain thread so no async runtime is nested.
fn server() -> &'static (Container<Postgres>, String) {
    static SERVER: OnceLock<(Container<Postgres>, String)> = OnceLock::new();
    SERVER.get_or_init(|| {
        std::thread::spawn(|| {
            let container = Postgres::default()
                .with_tag("17-alpine")
                .start()
                .expect("start Postgres; is Docker running?");
            let port = container.get_host_port_ipv4(5432).expect("postgres port");
            let url = format!("postgres://postgres:postgres@127.0.0.1:{port}");
            (container, url)
        })
        .join()
        .expect("container thread")
    })
}

/// A fresh database with the production migrations applied.
pub async fn database() -> PgPool {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let base = &server().1;
    let name = format!(
        "t{}_{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    );
    let admin = PgPool::connect(&format!("{base}/postgres"))
        .await
        .expect("admin pool");
    sqlx::query(sqlx::AssertSqlSafe(format!("create database {name}")))
        .execute(&admin)
        .await
        .expect("create database");
    admin.close().await;
    let pool = PgPool::connect(&format!("{base}/{name}"))
        .await
        .expect("pool");
    MIGRATOR.run(&pool).await.expect("migrations");
    pool
}

/// Nanosecond timestamp of block `height`: one block per second from a base.
pub fn timestamp_of(height: u64) -> String {
    (1_794_000_000_000_000_000_u128 + u128::from(height) * 1_000_000_000).to_string()
}

#[derive(Default, Clone)]
pub struct Outcome {
    pub executor: String,
    pub logs: Vec<String>,
    pub failed: bool,
    pub receipt_id: Option<String>,
    pub tx_hash: Option<String>,
}

pub fn outcome(executor: &str, logs: Vec<String>) -> Outcome {
    Outcome {
        executor: executor.to_owned(),
        logs,
        ..Outcome::default()
    }
}

/// A neardata-shaped block with the given receipt outcomes in one shard.
pub fn make_block(height: u64, outcomes: &[Outcome]) -> Block {
    let receipts: Vec<Value> = outcomes
        .iter()
        .enumerate()
        .map(|(i, o)| {
            let status = if o.failed {
                json!({ "Failure": { "ActionError": {} } })
            } else {
                json!({ "SuccessValue": "" })
            };
            json!({
                "tx_hash": o.tx_hash.clone().unwrap_or_else(|| format!("tx-{height}-{i}")),
                "execution_outcome": {
                    "id": o.receipt_id.clone().unwrap_or_else(|| format!("receipt-{height}-{i}")),
                    "outcome": { "executor_id": o.executor, "logs": o.logs, "status": status },
                },
            })
        })
        .collect();
    serde_json::from_value(json!({
        "block": { "header": { "height": height, "timestamp_nanosec": timestamp_of(height), "hash": format!("block-{height}") } },
        "shards": [{ "shard_id": 0, "receipt_execution_outcomes": receipts }],
    }))
    .expect("block")
}

/// A NEP-297 log line in the Comatocard envelope.
pub fn event_line(event: &str, data: Value) -> String {
    format!(
        "EVENT_JSON:{}",
        json!({ "standard": "comatocard", "version": "1.0.0", "event": event, "data": [data] })
    )
}

pub fn policy() -> Value {
    json!({
        "token": TOKEN, "per_tx_limit": "100000000", "daily_limit": "150000000",
        "monthly_limit": "1000000000", "approval_threshold": "50000000", "merchants": "any",
        "valid_from": null, "expires_at": null, "risk_mode": "block_only",
    })
}

fn payment(id: u64, merchant: &str, amount: &str, extra: Value) -> Value {
    let mut value = json!({ "payment_id": id, "card_id": 0, "merchant": merchant, "token": TOKEN, "amount": amount });
    if let (Some(target), Some(more)) = (value.as_object_mut(), extra.as_object()) {
        target.extend(more.clone());
    }
    value
}

/// A realistic history: vault creation, a card, a deposit, a settled payment, a queued payment
/// that is approved and settles, a rejection, a failed transfer, a registry block, plus noise the
/// indexer must ignore (another contract, a failed receipt, an invalid event).
#[allow(
    clippy::too_many_lines,
    reason = "the scenario reads as one recorded history"
)]
pub fn scenario() -> Vec<Block> {
    let tx = |hash: &str, o: Outcome| Outcome {
        tx_hash: Some(hash.to_owned()),
        ..o
    };
    vec![
        make_block(
            100,
            &[
                outcome(
                    FACTORY,
                    vec![event_line(
                        "vault_created",
                        json!({ "vault_id": VAULT, "owner_id": "alice.testnet", "code_version": 1 }),
                    )],
                ),
                outcome(
                    "unrelated.testnet",
                    vec![event_line(
                        "vault_created",
                        json!({ "vault_id": "x.testnet", "owner_id": "x.testnet", "code_version": 1 }),
                    )],
                ),
            ],
        ),
        make_block(
            101,
            &[
                outcome(
                    VAULT,
                    vec![
                        event_line(
                            "card_created",
                            json!({ "card_id": 0, "public_key": "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp", "label": "research agent", "kind": "agent", "policy": policy() }),
                        ),
                        event_line(
                            "approver_set",
                            json!({ "account_id": "council.testnet", "max_amount": "80000000" }),
                        ),
                    ],
                ),
                outcome(
                    VAULT,
                    vec![event_line(
                        "deposit",
                        json!({ "token": TOKEN, "sender_id": "alice.testnet", "amount": "500000000" }),
                    )],
                ),
            ],
        ),
        make_block(
            103,
            &[tx(
                "tx-pay-0",
                outcome(
                    VAULT,
                    vec![event_line(
                        "payment_submitted",
                        payment(
                            0,
                            "shop.testnet",
                            "40000000",
                            json!({ "memo": "api credits", "reference": "inv-1" }),
                        ),
                    )],
                ),
            )],
        ),
        make_block(
            104,
            &[
                outcome(
                    VAULT,
                    vec![event_line(
                        "payment_settled",
                        payment(
                            0,
                            "shop.testnet",
                            "40000000",
                            json!({ "reference": "inv-1" }),
                        ),
                    )],
                ),
                tx(
                    "tx-pay-1",
                    outcome(
                        VAULT,
                        vec![event_line(
                            "payment_queued",
                            payment(
                                1,
                                "travel.testnet",
                                "60000000",
                                json!({ "memo": null, "reference": null, "cause": "threshold" }),
                            ),
                        )],
                    ),
                ),
            ],
        ),
        make_block(
            105,
            &[
                outcome(
                    VAULT,
                    vec![event_line(
                        "payment_rejected",
                        json!({ "card_id": 0, "merchant": "shop.testnet", "token": TOKEN, "amount": "101000000", "reason": "per_tx_limit", "reference": "inv-2" }),
                    )],
                ),
                Outcome {
                    failed: true,
                    ..outcome(
                        VAULT,
                        vec![event_line(
                            "payment_rejected",
                            json!({ "card_id": 0, "merchant": "ghost.testnet", "token": TOKEN, "amount": "1", "reason": "amount_zero", "reference": null }),
                        )],
                    )
                },
                outcome(
                    VAULT,
                    vec![
                        "plain log line".to_owned(),
                        event_line("payment_settled", json!({ "payment_id": "bad" })),
                    ],
                ),
            ],
        ),
        make_block(
            106,
            &[outcome(
                VAULT,
                vec![event_line(
                    "payment_approved",
                    json!({ "payment_id": 1, "approver_id": "council.testnet" }),
                )],
            )],
        ),
        make_block(
            107,
            &[
                outcome(
                    VAULT,
                    vec![event_line(
                        "payment_settled",
                        payment(
                            1,
                            "travel.testnet",
                            "60000000",
                            json!({ "reference": null }),
                        ),
                    )],
                ),
                tx(
                    "tx-pay-2",
                    outcome(
                        VAULT,
                        vec![event_line(
                            "payment_submitted",
                            payment(
                                2,
                                "scam.testnet",
                                "10000000",
                                json!({ "memo": null, "reference": null }),
                            ),
                        )],
                    ),
                ),
            ],
        ),
        make_block(
            108,
            &[
                outcome(
                    REGISTRY,
                    vec![
                        event_line(
                            "report_submitted",
                            json!({ "report_id": 0, "account_id": "scam.testnet", "reporter_id": "bob.testnet", "category": "scam", "evidence_uri": "ipfs://evidence" }),
                        ),
                        event_line(
                            "status_changed",
                            json!({ "account_id": "scam.testnet", "status": "blocked", "curator_id": "curator.testnet", "report_ids": [0] }),
                        ),
                    ],
                ),
                outcome(
                    VAULT,
                    vec![event_line(
                        "payment_failed",
                        payment(
                            2,
                            "scam.testnet",
                            "10000000",
                            json!({ "cause": "merchant_blocked" }),
                        ),
                    )],
                ),
            ],
        ),
    ]
}

/// Indexes the scenario into `pool`.
pub async fn index_scenario(pool: &PgPool) {
    for block in scenario() {
        let height = block.block.header.height;
        comatocard_indexer::ingest::index_block(pool, &tracked(), height, Some(&block))
            .await
            .expect("index block");
    }
}

/// Serves recorded blocks; heights without a block return `None`, like neardata.
pub struct FixtureSource {
    blocks: HashMap<u64, Block>,
    head: u64,
    pub requests: Mutex<Vec<u64>>,
    pub failures: AtomicU32,
}

impl FixtureSource {
    pub fn new(blocks: Vec<Block>) -> Self {
        let head = blocks
            .iter()
            .map(|b| b.block.header.height)
            .max()
            .unwrap_or_default();
        Self {
            blocks: blocks
                .into_iter()
                .map(|b| (b.block.header.height, b))
                .collect(),
            head,
            requests: Mutex::new(Vec::new()),
            failures: AtomicU32::new(0),
        }
    }
}

impl BlockSource for FixtureSource {
    async fn final_height(&self) -> anyhow::Result<u64> {
        Ok(self.head)
    }

    async fn block(&self, height: u64) -> anyhow::Result<Option<Block>> {
        if self
            .failures
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_sub(1))
            .is_ok()
        {
            anyhow::bail!("temporary");
        }
        self.requests.lock().unwrap().push(height);
        Ok(self.blocks.get(&height).cloned())
    }
}

/// A chain where `missing.testnet` does not exist and every other account has `code_hash`.
#[derive(Default)]
pub struct FakeChain {
    pub code_hash: Mutex<Option<String>>,
}

impl Chain for FakeChain {
    async fn account(&self, account_id: &str) -> Option<ChainAccount> {
        if account_id == "missing.testnet" {
            return Some(ChainAccount {
                exists: false,
                code_hash: None,
            });
        }
        Some(ChainAccount {
            exists: true,
            code_hash: self.code_hash.lock().unwrap().clone(),
        })
    }

    async fn decimals(&self, token: &str) -> Option<u32> {
        token.starts_with("tusd").then_some(6)
    }
}
