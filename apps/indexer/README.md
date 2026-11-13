# apps/indexer

Rust service that follows finalized NEAR blocks from neardata, validates Comatocard events against the contract types, keeps Postgres projections and serves the REST and WebSocket API, including counterparty risk verdicts and an accountant CSV export.

Workstream A. Specification: [indexer API](../../docs/specs/indexer-api.md).

## Run locally
1. `docker compose -f apps/indexer/docker-compose.yml up -d postgres`, then `cp apps/indexer/.env.example apps/indexer/.env` and set `FACTORY_ID` and `REGISTRY_ID`.
2. `set -a && . apps/indexer/.env && set +a && cargo run -p comatocard-indexer`. Migrations run on start.
3. `curl localhost:4000/health` shows the indexed height and the lag behind the chain.
4. `curl "localhost:4000/vaults?owner=<account>"` lists the vaults of an owner once their `vault_created` events are indexed.

Container: `docker compose -f apps/indexer/docker-compose.yml up --build` runs Postgres and the indexer against testnet. The image is built from the repository root with `apps/indexer/Dockerfile`.

## Deploy
Every push to `main` that changes the indexer, the contracts it parses or the Rust toolchain runs `.github/workflows/indexer-image.yml`: it publishes `ghcr.io/comatocard/comatocard-indexer` (tags `main` and the commit SHA), then asks Coolify to redeploy https://indexer.comatocard.xyz and waits until `/health` answers `ok`. The `COOLIFY_DEPLOY_TOKEN` secret is a Coolify token limited to deploy and read. The live instance and its configuration are in [deployments](../../docs/deployments.md).

## Footprint
Measured on testnet on 2026-11-11 while following the chain: 6 to 9 MB resident memory and under 1.5% of one CPU. The TypeScript indexer it replaced used 80 to 100 MB.

The neardata free tier allows about 3 requests per second per IP. Testnet makes about 1.7 blocks per second, so the indexer reads the head height from the `last_block/final` redirect without following it and checks the head every 2 seconds at the tip. A shared or throttled IP still meets `429` responses; set `NEARDATA_API_KEY` for a deployment.

## Tests
- `pnpm test` (`cargo test --lib`): event parsing against the contract golden fixtures, the neardata client on a paused clock (pacing, `Retry-After`, redirects, shutdown), risk rules, formatting, configuration.
- `pnpm test:integration` (`cargo test --tests`, needs Docker): ingestion and the full API against a real Postgres started by testcontainers. The API snapshots in `tests/snapshots` were recorded by the TypeScript indexer and must keep matching.

## Layout
| Path | Purpose |
|-|-|
| `src/events.rs` | NEP-297 parsing into contract types |
| `src/neardata` | Block types, client, log extraction |
| `src/ingest` | Runner loop and projections |
| `src/risk.rs` | Signals and verdict rules |
| `src/rpc.rs` | NEAR RPC reads: accounts and token decimals |
| `src/api` | Axum routes, CSV and cursor formatting, stream filter |
| `migrations` | SQL schema, applied by sqlx on start |
