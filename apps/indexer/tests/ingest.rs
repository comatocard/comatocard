//! Ingestion against a real Postgres: projections, idempotency, the cursor and the runner loop.

mod support;

use std::sync::Arc;
use std::time::Duration;

use comatocard_indexer::bus::EventBus;
use comatocard_indexer::ingest::{Progress, Runner, index_block, stored_height};
use serde_json::json;
use sqlx::PgPool;
use support::{
    FixtureSource, VAULT, event_line, index_scenario, make_block, outcome, scenario, tracked,
};
use tokio_util::sync::CancellationToken;

/// Payment id, status, queue cause and reason.
type PaymentRow = (Option<i64>, String, Option<String>, Option<String>);

async fn rows(pool: &PgPool, sql: &'static str) -> Vec<(String,)> {
    sqlx::query_as(sql).fetch_all(pool).await.unwrap()
}

#[tokio::test]
async fn projects_the_scenario() {
    let pool = support::database().await;
    index_scenario(&pool).await;
    let vaults = rows(&pool, "select vault_id from vaults").await;
    assert_eq!(
        vaults,
        [(VAULT.to_owned(),)],
        "the unrelated contract is ignored"
    );
    let statuses: Vec<PaymentRow> =
        sqlx::query_as("select payment_id, status, queue_cause, reason from payments order by id")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        statuses,
        [
            (Some(0), "settled".into(), None, None),
            (Some(1), "settled".into(), Some("threshold".into()), None),
            (None, "rejected".into(), None, Some("per_tx_limit".into())),
            (
                Some(2),
                "failed".into(),
                None,
                Some("merchant_blocked".into())
            ),
        ]
    );
    let dead: Vec<(String,)> = sqlx::query_as("select error from dead_letters")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(dead.len(), 1);
    assert!(dead[0].0.starts_with("payment_settled"), "{}", dead[0].0);
    let registry: Vec<(String, serde_json::Value)> =
        sqlx::query_as("select status, report_ids from registry_statuses")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(registry, [("blocked".to_owned(), json!([0]))]);
    assert_eq!(stored_height(&pool).await.unwrap(), Some(108));
}

#[tokio::test]
async fn replaying_a_block_changes_nothing() {
    let pool = support::database().await;
    index_scenario(&pool).await;
    let block = &scenario()[2];
    let (result, published) = index_block(&pool, &tracked(), 103, Some(block))
        .await
        .unwrap();
    assert_eq!((result.indexed, result.duplicates), (0, 1));
    assert!(published.is_empty());
    let count: i64 = sqlx::query_scalar("select count(*) from payments")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 4);
}

#[tokio::test]
async fn empty_heights_advance_the_cursor() {
    let pool = support::database().await;
    index_block(&pool, &tracked(), 42, None).await.unwrap();
    assert_eq!(stored_height(&pool).await.unwrap(), Some(42));
}

#[tokio::test]
async fn applies_card_approver_and_owner_lifecycle_events() {
    let pool = support::database().await;
    index_scenario(&pool).await;
    let block = make_block(
        200,
        &[outcome(
            VAULT,
            vec![
                event_line("card_frozen", json!({ "card_id": 0 })),
                event_line(
                    "card_key_rotated",
                    json!({ "card_id": 0, "old_public_key": "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp", "new_public_key": "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847" }),
                ),
                event_line(
                    "approver_set",
                    json!({ "account_id": "council.testnet", "max_amount": null }),
                ),
                event_line(
                    "owner_proposed",
                    json!({ "owner_id": "dao.sputnik-v2.testnet" }),
                ),
                event_line(
                    "owner_changed",
                    json!({ "owner_id": "dao.sputnik-v2.testnet" }),
                ),
                event_line(
                    "withdrawal",
                    json!({ "token": "tusd.comatocard.testnet", "receiver_id": "alice.testnet", "amount": "5", "success": false }),
                ),
            ],
        )],
    );
    index_block(&pool, &tracked(), 200, Some(&block))
        .await
        .unwrap();
    let card: (String, Option<String>) = sqlx::query_as("select status, public_key from cards")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        card,
        (
            "frozen".to_owned(),
            Some("ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847".to_owned())
        )
    );
    let approvers: i64 = sqlx::query_scalar("select count(*) from approvers")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(approvers, 0);
    let owner: (String, Option<String>) =
        sqlx::query_as("select owner_id, pending_owner_id from vaults")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(owner, ("dao.sputnik-v2.testnet".to_owned(), None));
    let flows: Vec<(String, bool)> =
        sqlx::query_as("select kind, success from token_flows order by created_at")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(
        flows,
        [
            ("deposit".to_owned(), true),
            ("withdrawal".to_owned(), false)
        ]
    );
}

#[tokio::test]
async fn tracks_the_card_holder_across_token_transfers() {
    let pool = support::database().await;
    index_scenario(&pool).await;
    let transfer = |height: u64, from: &str, to: &str| {
        make_block(
            height,
            &[outcome(
                VAULT,
                vec![event_line(
                    "card_transferred",
                    json!({ "card_id": 0, "old_holder": from, "new_holder": to }),
                )],
            )],
        )
    };
    index_block(
        &pool,
        &tracked(),
        200,
        Some(&transfer(200, "alice.testnet", "agent.testnet")),
    )
    .await
    .unwrap();
    let handed: (Option<String>, Option<String>) =
        sqlx::query_as("select holder_id, public_key from cards")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(handed, (Some("agent.testnet".to_owned()), None));
    index_block(
        &pool,
        &tracked(),
        201,
        Some(&transfer(201, "agent.testnet", "alice.testnet")),
    )
    .await
    .unwrap();
    let returned: (Option<String>,) = sqlx::query_as("select holder_id from cards")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        returned.0, None,
        "a card back with the owner follows ownership"
    );
}

async fn run_until(
    pool: &PgPool,
    source: Arc<FixtureSource>,
    start: Option<u64>,
    bus: EventBus,
    height: u64,
) -> Arc<Progress> {
    let progress = Arc::new(Progress::default());
    let shutdown = CancellationToken::new();
    let runner = Runner {
        pool: pool.clone(),
        source,
        bus,
        tracked: tracked(),
        start_block: start,
        poll_interval: Duration::from_millis(5),
        progress: progress.clone(),
    };
    let task = tokio::spawn(runner.run(shutdown.clone()));
    tokio::time::timeout(Duration::from_secs(10), async {
        while progress.indexed() != Some(height) {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("runner reaches the head");
    shutdown.cancel();
    task.await.unwrap().unwrap();
    progress
}

#[tokio::test]
async fn follows_the_source_and_publishes_committed_events() {
    let pool = support::database().await;
    let source = Arc::new(FixtureSource::new(scenario()));
    let bus = EventBus::default();
    let mut events = bus.subscribe();
    let progress = run_until(&pool, source.clone(), Some(100), bus, 108).await;
    assert_eq!(
        source.requests.lock().unwrap()[..9],
        [100, 101, 102, 103, 104, 105, 106, 107, 108]
    );
    assert_eq!(progress.chain(), Some(108));
    let mut names = Vec::new();
    while let Ok(event) = events.try_recv() {
        names.push(event.event);
    }
    assert!(names.contains(&"payment_settled".to_owned()));
}

#[tokio::test]
async fn resumes_after_the_stored_cursor() {
    let pool = support::database().await;
    index_block(&pool, &tracked(), 104, None).await.unwrap();
    let source = Arc::new(FixtureSource::new(scenario()));
    run_until(&pool, source.clone(), None, EventBus::default(), 108).await;
    assert_eq!(source.requests.lock().unwrap()[0], 105);
}

#[tokio::test]
async fn keeps_running_after_a_source_failure() {
    let pool = support::database().await;
    let source = Arc::new(FixtureSource::new(scenario()));
    source
        .failures
        .store(1, std::sync::atomic::Ordering::Relaxed);
    run_until(&pool, source, Some(100), EventBus::default(), 108).await;
}
