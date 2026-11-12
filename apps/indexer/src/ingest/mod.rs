//! Follows finalized blocks and indexes each one atomically: raw events, projections, dead
//! letters and the cursor commit together, and subscribers hear about events only afterwards.

mod project;

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use futures_util::StreamExt;
use sqlx::PgPool;
use tokio_util::sync::CancellationToken;

pub use project::Origin;

use crate::bus::{EventBus, StreamEvent};
use crate::events::{ParseError, parse_event_log};
use crate::neardata::{Block, BlockSource, Tracked, extract_logs};

const CURSOR_ID: &str = "main";
const UNSET: u64 = u64::MAX;
/// Blocks fetched ahead of the one being indexed. neardata latency, not throughput, bounds a
/// sequential fetch; with an API key this multiplies the catch-up rate.
const PREFETCH: usize = 8;

/// Ingestion progress shared with the health endpoint.
#[derive(Debug)]
pub struct Progress {
    indexed: AtomicU64,
    chain: AtomicU64,
}

impl Default for Progress {
    fn default() -> Self {
        Self {
            indexed: AtomicU64::new(UNSET),
            chain: AtomicU64::new(UNSET),
        }
    }
}

impl Progress {
    pub fn indexed(&self) -> Option<u64> {
        Some(self.indexed.load(Ordering::Relaxed)).filter(|h| *h != UNSET)
    }

    pub fn chain(&self) -> Option<u64> {
        Some(self.chain.load(Ordering::Relaxed)).filter(|h| *h != UNSET)
    }

    pub fn set(&self, indexed: Option<u64>, chain: Option<u64>) {
        if let Some(height) = indexed {
            self.indexed.store(height, Ordering::Relaxed);
        }
        if let Some(height) = chain {
            self.chain.store(height, Ordering::Relaxed);
        }
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct BlockResult {
    pub indexed: usize,
    pub duplicates: usize,
    pub dead_letters: usize,
}

/// Indexes one block in a single transaction and returns the events to publish.
///
/// # Errors
/// Fails when the database rejects the transaction; nothing of the block is kept then.
pub async fn index_block(
    pool: &PgPool,
    tracked: &Tracked,
    height: u64,
    block: Option<&Block>,
) -> sqlx::Result<(BlockResult, Vec<StreamEvent>)> {
    let mut result = BlockResult::default();
    let mut published = Vec::new();
    let logs = block.map(|b| extract_logs(b, tracked)).unwrap_or_default();
    let mut tx = pool.begin().await?;
    for log in logs {
        let event = match parse_event_log(&log.line) {
            Ok(event) => event,
            Err(ParseError::Invalid(error)) => {
                sqlx::query(
                    "insert into dead_letters (receipt_id, log_index, block_height, contract_id, line, error) \
                     values ($1, $2, $3, $4, $5, $6) on conflict do nothing",
                )
                .bind(&log.receipt_id)
                .bind(i64::from(log.log_index))
                .bind(i64::try_from(log.block_height).unwrap_or(i64::MAX))
                .bind(&log.executor_id)
                .bind(&log.line)
                .bind(error)
                .execute(&mut *tx)
                .await?;
                result.dead_letters += 1;
                continue;
            }
            Err(_) => continue,
        };
        let inserted = sqlx::query(
            "insert into events (receipt_id, log_index, block_height, block_timestamp, tx_hash, contract_id, event, version, data) \
             values ($1, $2, $3, $4::numeric, $5, $6, $7, $8, $9) on conflict do nothing",
        )
        .bind(&log.receipt_id)
        .bind(i64::from(log.log_index))
        .bind(i64::try_from(log.block_height).unwrap_or(i64::MAX))
        .bind(&log.block_timestamp)
        .bind(log.tx_hash.as_deref())
        .bind(&log.executor_id)
        .bind(&event.name)
        .bind(&event.version)
        .bind(&event.raw)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if inserted == 0 {
            result.duplicates += 1;
            continue;
        }
        let origin = Origin {
            contract_id: log.executor_id.clone(),
            receipt_id: log.receipt_id.clone(),
            log_index: log.log_index,
            block_height: log.block_height,
            block_timestamp: log.block_timestamp.clone(),
            tx_hash: log.tx_hash.clone(),
        };
        project::project(&mut tx, &origin, &event.data).await?;
        result.indexed += 1;
        published.push(StreamEvent {
            contract_id: log.executor_id,
            event: event.name,
            data: event.raw,
            block_height: log.block_height,
            tx_hash: log.tx_hash,
            timestamp: log.block_timestamp,
        });
    }
    sqlx::query(
        "insert into cursor (id, height) values ($1, $2) on conflict (id) do update set height = excluded.height",
    )
    .bind(CURSOR_ID)
    .bind(i64::try_from(height).unwrap_or(i64::MAX))
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((result, published))
}

/// The last indexed height, if any.
///
/// # Errors
/// Fails when the database cannot be read.
pub async fn stored_height(pool: &PgPool) -> sqlx::Result<Option<u64>> {
    let height: Option<i64> = sqlx::query_scalar("select height from cursor where id = $1")
        .bind(CURSOR_ID)
        .fetch_optional(pool)
        .await?;
    Ok(height.and_then(|h| u64::try_from(h).ok()))
}

pub struct Runner<S> {
    pub pool: PgPool,
    pub source: S,
    pub bus: EventBus,
    pub tracked: Tracked,
    /// Height to start from when no cursor is stored; defaults to the current final height.
    pub start_block: Option<u64>,
    pub poll_interval: Duration,
    pub progress: Arc<Progress>,
}

impl<S: BlockSource> Runner<S> {
    /// Follows the chain until `shutdown` is cancelled: indexes every height after the cursor up
    /// to the final head, then waits `poll_interval` and checks again.
    ///
    /// # Errors
    /// Fails only when the cursor cannot be read at start; later failures are logged and retried.
    pub async fn run(self, shutdown: CancellationToken) -> anyhow::Result<()> {
        let stored = stored_height(&self.pool).await?;
        let mut next = match (stored, self.start_block) {
            (Some(height), _) => height + 1,
            (None, Some(start)) => start,
            (None, None) => self.source.final_height().await?,
        };
        self.progress.set(stored, None);
        tracing::info!(next, "indexer starting");
        while !shutdown.is_cancelled() {
            if let Err(error) = self.catch_up(&mut next, &shutdown).await {
                tracing::error!(%error, next, "indexing failed, retrying");
            }
            tokio::select! {
                () = tokio::time::sleep(self.poll_interval) => {}
                () = shutdown.cancelled() => {}
            }
        }
        tracing::info!(indexed = self.progress.indexed(), "indexer stopped");
        Ok(())
    }

    async fn catch_up(&self, next: &mut u64, shutdown: &CancellationToken) -> anyhow::Result<()> {
        let head = self.source.final_height().await?;
        self.progress.set(None, Some(head));
        // Fetch up to PREFETCH blocks concurrently; `buffered` yields them in height order, so
        // indexing, the cursor and the progress stay strictly sequential.
        let mut blocks = futures_util::stream::iter(*next..=head)
            .map(|height| self.source.block(height))
            .buffered(PREFETCH);
        while *next <= head && !shutdown.is_cancelled() {
            let Some(block) = blocks.next().await else {
                break;
            };
            let block = block?;
            let (result, published) =
                index_block(&self.pool, &self.tracked, *next, block.as_ref()).await?;
            for event in published {
                self.bus.publish(event);
            }
            if result.indexed + result.dead_letters > 0 {
                tracing::info!(
                    height = *next,
                    indexed = result.indexed,
                    duplicates = result.duplicates,
                    dead_letters = result.dead_letters,
                    "block indexed"
                );
            }
            self.progress.set(Some(*next), None);
            *next += 1;
        }
        Ok(())
    }
}
