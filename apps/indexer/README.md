# apps/indexer

Polls finalized NEAR blocks from neardata, validates Comatocard events with `@comatocard/sdk`, maintains Postgres projections and serves a REST and WebSocket API, including counterparty risk verdicts and an accountant CSV export.

Workstream A. Specification: [indexer API](../../docs/specs/indexer-api.md).

## Run locally
1. `docker compose -f apps/indexer/docker-compose.yml up -d`, then `cp apps/indexer/.env.example apps/indexer/.env` and set `FACTORY_ID` and `REGISTRY_ID`.
2. `pnpm turbo run build --filter=@comatocard/indexer`, then from `apps/indexer`: `node --env-file=.env dist/main.js`. Migrations run on start.
3. `curl localhost:4000/health` shows the indexed height and the lag behind the chain.
4. `curl "localhost:4000/vaults?owner=<account>"` lists the vaults of an owner once their `vault_created` events are indexed.

## Tests
- `pnpm test`: unit tests (extraction, neardata client, risk rules, CSV, pagination, configuration).
- `pnpm test:integration`: recorded blocks through the runner into PGlite, the full API with snapshot regressions, and the WebSocket stream; reports combined coverage.

## Layout
| Path | Purpose |
|-|-|
| `src/neardata` | Block source, block schema, log extraction |
| `src/ingest` | Runner loop and projections |
| `src/db` | Drizzle schema; SQL migrations live in `drizzle/` |
| `src/risk` | Signals, verdict rules, chain reader |
| `src/api` | Hono routes, CSV, pagination, stream filter |
