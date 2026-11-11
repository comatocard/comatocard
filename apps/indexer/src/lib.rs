//! Comatocard indexer: follows finalized NEAR blocks from neardata, validates Comatocard events
//! against the contract types, keeps Postgres projections and serves REST and WebSocket APIs.
//! Specification: `docs/specs/indexer-api.md`.

pub mod api;
pub mod bus;
pub mod config;
pub mod events;
pub mod ingest;
pub mod neardata;
pub mod risk;
pub mod rpc;

/// SQL migrations, applied on start.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
