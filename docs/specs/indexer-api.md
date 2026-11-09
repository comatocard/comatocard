# Indexer API specification

Status: draft v0. Owner: indexer workstream.

## Ingestion
- Source: neardata finalized blocks (`/v0/block/:height`, `/v0/last_block/final`), testnet or mainnet by configuration.
- Filter: receipt outcomes whose `executor_id` is the factory, the registry, or an account ending in `.<factory>`.
- Parse logs starting with `EVENT_JSON:`, validate against `packages/sdk` schemas, reject and record unknown shapes in a dead-letter table.
- Idempotency key: `(receipt_id, log_index)`. A cursor table stores the last processed height; restart resumes from it.
- Projections, updated in the same database transaction as the raw event insert: `vaults`, `cards`, `payments`, `approvers`, `deposits`, `withdrawals`, `registry_reports`, `registry_statuses`.

## REST
All responses are JSON unless noted. Lists use cursor pagination (`?cursor=&limit=`).

| Method and path | Returns |
|-|-|
| `GET /health` | Status, indexed height, chain head, lag |
| `GET /vaults?owner=` | Vaults of an owner |
| `GET /vaults/:vault` | Vault summary: balances, card count, spend this day and period |
| `GET /vaults/:vault/cards` | Cards with status, policy and spend |
| `GET /vaults/:vault/cards/:card` | One card with recent payments |
| `GET /vaults/:vault/payments?card=&status=&merchant=&from=&to=` | Payment history including rejections and reasons |
| `GET /vaults/:vault/payments/:id` | One payment with all its events and transaction links |
| `GET /vaults/:vault/approvals` | Queued payments |
| `GET /vaults/:vault/export.csv?from=&to=` | Accountant export: date, card, merchant, token, amount, status, reason, reference, transaction hash |
| `GET /analytics/:vault?period=` | Spend by card, merchant and day |
| `GET /risk/:account?vault=` | Counterparty signals: registry status and reports, first seen, prior payments from this vault, contract or not, code hash changed recently, a verdict `allow`, `warn` or `block` with reasons |
| `GET /merchants/:merchant/payments?reference=` | Lets a merchant confirm a payment by reference (HTTP 402 flow) |

## WebSocket
`GET /stream?vault=<id>` or `?merchant=<id>`: pushes each validated event as `{ "contract_id", "event", "data", "block_height", "tx_hash", "timestamp" }` after it is committed.

## Operations
- Postgres in Docker Compose for local development.
- Configuration through environment variables: network, factory id, registry id, database URL, neardata API key (optional).
- Metrics: indexed height, lag, events per type, dead letters.
