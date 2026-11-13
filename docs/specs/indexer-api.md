# Indexer API specification

Status: v1, implemented in Rust in `apps/indexer`. Owner: indexer workstream.

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
| `GET /cards?holder=` | Cards that are not revoked and whose token the account holds, across vaults; cards without an explicit holder count for the vault owner |
| `GET /vaults/:vault/cards/:card` | One card with recent payments |
| `GET /vaults/:vault/payments?card=&status=&merchant=&from=&to=&cursor=&limit=` | `{ items, next_cursor }`, newest first, at most 100 per page; `from` and `to` are nanosecond timestamps |
| `GET /vaults/:vault/payments/:id` | One payment with all its events and transaction links |
| `GET /vaults/:vault/approvals` | `{ items, approvers }`: queued payments and approver limits |
| `GET /vaults/:vault/export.csv?from=&to=&fiat=&rate=&rate_source=&rate_at=` | RFC 4180 CSV: `date_utc`, card id and label, merchant, token, `amount` in token units (from `ft_metadata` decimals), `amount_raw`, status, queue cause, reason, reference, memo, payment id, transaction hash; formula-like cells are quoted. With all four valuation parameters (an ISO 4217 code, a positive decimal rate per token unit, the rate source and its date) it adds `fiat_currency`, `fiat_amount` (exact, rounded half up to two decimals), `fiat_rate`, `rate_source` and `rate_at`. The indexer never fetches a rate itself, so every value traces to the source the operator named |
| `GET /analytics/:vault?from=&to=` | Settled spend by card, merchant and UTC day, plus rejection counts by reason |
| `GET /risk/:account?vault=` | `{ account_id, verdict, reasons, signals }`. Verdict `block` for registry blocked accounts and for accounts with a curator sanctions report (reason `sanctions_listed`, `signals.sanctions_lists` such as `OFAC-SDN (2026-03-21)`); `warn` for flagged accounts, missing accounts and contracts whose code changed within 7 days of being first observed; otherwise `allow`. Informational reasons: open reports, first payment from this vault, never paid by any vault, chain lookup failed |
| `GET /merchants/:merchant/payments?reference=` | Lets a merchant confirm a payment by reference (HTTP 402 flow) |

## WebSocket
`GET /stream?vault=<id>` or `?merchant=<id>`: pushes each validated event as `{ "contract_id", "event", "data", "block_height", "tx_hash", "timestamp" }` after it is committed.

## GraphQL
`POST /graphql` answers read-only GraphQL queries; `GET /graphql` opens GraphiQL with the Explorer, which lists every query, argument and field, and an example over `v5.factory.comatocard.testnet`. Every field calls the REST route for the same data, so validation, errors and values match REST.

| Root field | Type | REST route |
|-|-|-|
| `health` | `Health` | `GET /health` |
| `vaults(owner)`, `vault(id)` | `[Vault]`, `Vault` | `GET /vaults?owner=`, `GET /vaults/:vault` |
| `cards(vault)`, `card(vault, id)`, `cardsByHolder(holder)` | `[Card]`, `Card` | `GET /vaults/:vault/cards`, `GET /vaults/:vault/cards/:card`, `GET /cards?holder=` |
| `payments(vault, card, status, merchant, from, to, limit, cursor)` | `PaymentPage` | `GET /vaults/:vault/payments` |
| `payment(vault, id)`, `approvals(vault)` | `Payment`, `Approvals` | `GET /vaults/:vault/payments/:id`, `GET /vaults/:vault/approvals` |
| `merchantPayments(merchant, reference)` | `[Payment]` | `GET /merchants/:merchant/payments` |
| `analytics(vault, from, to)`, `risk(account, vault)` | `Analytics`, `RiskAssessment` | `GET /analytics/:vault`, `GET /risk/:account` |

Entities nest like a subgraph:
- `Vault`: `cards`, `payments(...)`, `approvals`, `analytics(from, to)`, `indexedBalances`.
- `Card`: `vault`, `policy` (typed limits, `merchants` as JSON), `payments(status, limit, cursor)`.
- `Payment`: `card`, `vault`, `events` (the vault events of the payment in block order).

Fields are camelCase; amounts are strings in the token's smallest unit, times are nanoseconds as strings. Errors use the GraphQL `errors` array with the REST message, for example `invalid request: vault: invalid account id` or `vault not found`. Queries deeper than 16 levels or above complexity 1000 are rejected; the limits fit the introspection query GraphiQL sends.

## Operations
- Postgres and the indexer image in Docker Compose (`apps/indexer/docker-compose.yml`).
- Configuration through environment variables: network, factory id, registry id, database URL, neardata API key (recommended for deployments), head poll interval.
- Invalid requests answer 400 with `{ "error": "invalid request", "details": "<field>: <problem>" }`.
- Metrics: indexed height, lag, events per type, dead letters.
