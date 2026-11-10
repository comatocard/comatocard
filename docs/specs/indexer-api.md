# Indexer API specification

Status: v1, implemented in `apps/indexer`. Owner: indexer workstream.

## Ingestion
- Source: neardata finalized blocks (`/v0/block/:height`, `/v0/last_block/final`), testnet or mainnet by configuration.
- Filter: successful receipt outcomes whose `executor_id` is the factory, the registry, or a direct sub-account `<name>.<factory>`. Logs of failed receipts are ignored because their effects were rolled back.
- Parse logs starting with `EVENT_JSON:`, validate against `packages/sdk` schemas, reject and record unknown shapes in a dead-letter table.
- Idempotency key: `(receipt_id, log_index)`. A cursor table stores the last processed height; restart resumes from it.
- Projections, updated in the same database transaction as the raw event insert and the cursor: `vaults`, `cards`, `payments`, `approvers`, `token_flows` (deposits and withdrawals), `registry_reports`, `registry_statuses`. A replayed event is skipped before projection, so reprocessing a block never double counts.
- WebSocket subscribers receive events only after their block is committed.

## Payment rows
Every payment attempt is one row. Stored payments carry `payment_id`; rejections have `payment_id: null`. `status` is one of `submitted`, `queued`, `approved`, `settled`, `failed`, `declined`, `expired`, `rejected`. `queue_cause` keeps why a payment waited for approval (`threshold`, `risk_flagged`) after it settles; `reason` holds the reject reason or failure cause.

## REST
All responses are JSON unless noted. Lists use cursor pagination (`?cursor=&limit=`).

| Method and path | Returns |
|-|-|
| `GET /health` | Status, indexed height, chain head, lag |
| `GET /vaults?owner=` | Vaults of an owner |
| `GET /vaults/:vault` | Vault summary: owner, card count, `spent_today` (reserved and settled spend since 00:00 UTC) and `indexed_balances` per token derived from events (`available`, `reserved`); the contract view `get_balances` is authoritative |
| `GET /vaults/:vault/cards` | Cards with status, policy, `public_key` (null after a token transfer until the holder sets a key) and `holder_id` (null means the vault owner); live spend counters come from the vault view `list_cards` |
| `GET /vaults/:vault/cards/:card` | One card with recent payments |
| `GET /vaults/:vault/payments?card=&status=&merchant=&from=&to=&cursor=&limit=` | `{ items, next_cursor }`, newest first, at most 100 per page; `from` and `to` are nanosecond timestamps |
| `GET /vaults/:vault/payments/:id` | One payment with all its events and transaction links |
| `GET /vaults/:vault/approvals` | `{ items, approvers }`: queued payments and approver limits |
| `GET /vaults/:vault/export.csv?from=&to=` | RFC 4180 CSV: `date_utc`, card id and label, merchant, token, `amount` in token units (from `ft_metadata` decimals), `amount_raw`, status, queue cause, reason, reference, memo, payment id, transaction hash; formula-like cells are quoted |
| `GET /analytics/:vault?from=&to=` | Settled spend by card, merchant and UTC day, plus rejection counts by reason |
| `GET /risk/:account?vault=` | `{ account_id, verdict, reasons, signals }`. Verdict `block` for registry blocked accounts; `warn` for flagged accounts, missing accounts and contracts whose code changed within 7 days of being first observed; otherwise `allow`. Informational reasons: open reports, first payment from this vault, never paid by any vault, chain lookup failed |
| `GET /merchants/:merchant/payments?reference=` | Lets a merchant confirm a payment by reference (HTTP 402 flow) |

## WebSocket
`GET /stream?vault=<id>` or `?merchant=<id>`: pushes each validated event as `{ "contract_id", "event", "data", "block_height", "tx_hash", "timestamp" }` after it is committed.

## Operations
- Postgres in Docker Compose for local development.
- Configuration through environment variables: network, factory id, registry id, database URL, neardata API key (optional).
- Metrics: indexed height, lag, events per type, dead letters.
