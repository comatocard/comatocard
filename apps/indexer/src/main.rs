use std::collections::HashMap;
use std::sync::Arc;

use comatocard_indexer::MIGRATOR;
use comatocard_indexer::api::{AppState, now_nanos, router};
use comatocard_indexer::bus::EventBus;
use comatocard_indexer::config::Config;
use comatocard_indexer::ingest::{Progress, Runner};
use comatocard_indexer::neardata::{Neardata, NeardataOptions, Tracked};
use comatocard_indexer::rpc::Rpc;
use sqlx::postgres::PgPoolOptions;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let env: HashMap<String, String> = std::env::vars().collect();
    let config = Config::from_env(&env).map_err(anyhow::Error::msg)?;
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(EnvFilter::new(format!(
            "comatocard_indexer={},warn",
            config.log_level
        )))
        .init();

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;
    MIGRATOR.run(&pool).await?;

    let shutdown = CancellationToken::new();
    let http = reqwest::Client::builder()
        .user_agent("comatocard-indexer")
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let bus = EventBus::default();
    let progress = Arc::new(Progress::default());

    let mut options = NeardataOptions::new(&config.neardata_url, config.neardata_api_key.clone());
    options.min_interval = config.neardata_min_interval;
    let runner = Runner {
        pool: pool.clone(),
        // neardata redirects `last_block/final`; the client reads the height from the redirect.
        source: Neardata::new(
            reqwest::Client::builder()
                .user_agent("comatocard-indexer")
                .timeout(std::time::Duration::from_secs(30))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
            options,
            shutdown.clone(),
        ),
        bus: bus.clone(),
        tracked: Tracked::new(&config.factory_id, config.registry_id.as_deref()),
        start_block: config.start_block,
        poll_interval: config.poll_interval,
        progress: progress.clone(),
    };
    let ingestion = tokio::spawn(runner.run(shutdown.clone()));

    let app = router(AppState {
        pool: pool.clone(),
        chain: Rpc::new(http, &config.rpc_url),
        bus,
        progress,
        registry_id: config.registry_id.clone(),
        now: now_nanos,
    });
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", config.port)).await?;
    tracing::info!(port = config.port, network = %config.network, "api listening");
    let signal = shutdown.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            wait_for_signal().await;
            tracing::info!("shutting down");
            signal.cancel();
        })
        .await?;
    ingestion.await??;
    pool.close().await;
    Ok(())
}

async fn wait_for_signal() {
    let interrupt = tokio::signal::ctrl_c();
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("install the SIGTERM handler");
        tokio::select! {
            _ = interrupt => {}
            _ = terminate.recv() => {}
        }
    }
    #[cfg(not(unix))]
    let _ = interrupt.await;
}
