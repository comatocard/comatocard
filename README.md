# Comatocard

Programmable payment cards for people and AI agents, enforced by smart contracts on NEAR.

[Docs](https://docs.comatocard.xyz) · [Indexer GraphQL](https://indexer.comatocard.xyz/graphql) · [Testnet deployment](docs/deployments.md)

The docs and the testnet indexer are live; the hosted app is being deployed, so until then the steps below run against NEAR testnet and locally.

## What it is
A Comatocard vault is a self-custodial NEAR account that holds stablecoins and issues cards. A card is a NEAR access key that can call only `pay`, with its own spending policy: limits per payment, day and 30-day period, merchant allow or deny lists, an approval threshold, a validity window and counterparty checks. The vault enforces the policy on every payment and records every attempt, including rejections and their reasons, as an on-chain event. An AI agent can spend on its own, inside limits it cannot change.

- **Cards for agents.** Give an agent a card, not a wallet. It pays APIs and merchants within its policy; anything above the threshold waits for a human or a DAO vote.
- **Cards as tokens.** Every card is a NEP-171 token. Transferring it hands the card to someone else and deletes the old key.
- **Counterparty checks.** A registry of evidence-backed reports and curator statuses, including sanctions listings, is checked on-chain before paying.
- **Books that reconcile.** A Rust indexer serves the history, approvals, risk verdicts and an accountant CSV with optional fiat valuation.

## Security first, compliance ready
- **The contract is the control.** Policies are enforced on-chain; a card key cannot withdraw, change limits or approve.
- **Fails closed.** Registry errors, missing checks and full queues end in a recorded rejection, never a silent payment.
- **Audited.** An independent review found three high issues; all are fixed in vault 0.4.0 with regression tests. See [Security model](docs/security.md).
- **Built for the rules where it runs.** Sanctions reports name their official list, approvals name their approver, and the docs map each control to local and global rules. Comatocard is not offered for paying Indonesian merchants in stablecoins for domestic sales, as the Currency Law requires rupiah. See [Compliance readiness](docs/compliance.md) and [Compliance research](docs/compliance-research.md).

## Try it
Requirements: Node 24 with pnpm, Rust from `rust-toolchain.toml` with [cargo-near](https://github.com/near/cargo-near), Docker.

1. **Build and test everything.** `pnpm install && pnpm build && pnpm test` builds the contracts and apps and runs the unit tests. `pnpm test:integration` runs the near-sandbox and Postgres tests.
2. **See a vault on testnet.** `near contract call-function as-read-only v5.factory.comatocard.testnet get_config json-args '{}' network-config testnet now` returns the owner, the registry and `contract_version` `0.4.0`. Its code is the reproducible build attached to [release v0.4.1](https://github.com/comatocard/comatocard/releases/tag/v0.4.1).
3. **See a payment that settled.** Open `https://testnet.nearblocks.io/txns/7nK8SHcVnQWgDjeng4ozKgUA7ueGMRei5d6FSyZmbVmR`: a card paid 1 tUSD after an on-chain registry check (`payment_submitted`, `payment_settled`).
4. **Query the live indexer.** Open https://indexer.comatocard.xyz/graphql and run `{ cards(vault: "v5.factory.comatocard.testnet") { cardId label status } payments(vault: "v5.factory.comatocard.testnet") { items { status amount merchant reference } } }`: card 0 is active and the payment above is `settled`. The same data is at `https://indexer.comatocard.xyz/vaults/v5.factory.comatocard.testnet/payments`.
5. **Index it yourself.** `docker compose -f apps/indexer/docker-compose.yml up --build` starts Postgres and the indexer on testnet; `curl localhost:4000/health` shows the indexed height and the lag. Events from then on appear under `/vaults/<vault>/payments` and in `/vaults/<vault>/export.csv`.
6. **Pay from an agent.** `apps/agents` holds a card key and pays through its guard (preview, risk verdict, human confirmation on warn). See [apps/agents](apps/agents/README.md).
7. **Act as an owner without NEAR.** `apps/relayer` sponsors owner calls signed as delegate actions: `pnpm owner-call <vault> freeze_card '{"card_id":0}'` freezes a card while the owner balance stays unchanged, and refuses card payments, other contracts and senders that are not the owner. See [apps/relayer](apps/relayer/README.md).

Every transaction of the testnet checks, including a rejection, an approval and a card handover, is listed in [docs/deployments.md](docs/deployments.md).

## Repository
| Path | Purpose |
|-|-|
| [`contracts/vault`](contracts/vault) | Vault: cards, policies, approvals, payments, card tokens |
| [`contracts/factory`](contracts/factory) | Creates vaults from the published global vault code |
| [`contracts/registry`](contracts/registry) | Counterparty registry with reports, curators and sanctions listings |
| [`contracts/mock-ft`](contracts/mock-ft) | tUSD, the testnet stablecoin |
| [`apps/indexer`](apps/indexer) | Rust indexer: REST, WebSocket, risk verdicts, CSV export |
| [`apps/agents`](apps/agents) | Spending agent with its guard |
| [`apps/docs`](apps/docs) | Documentation site, generated from `docs/` |
| [`apps/relayer`](apps/relayer) | Meta transaction relayer for owner actions |
| [`apps/web`](apps/web) | Owner app and the HTTP 402 demo merchant (`/shop`) |
| [`packages/sdk`](packages/sdk) | Types, event schemas, vault client and compliance helpers |
| [`packages/config`](packages/config) | Shared TypeScript and lint configuration |

## Documentation
[Architecture](docs/architecture.md) · [Vault contract](docs/specs/vault-contract.md) · [Events](docs/specs/events.md) · [Indexer API](docs/specs/indexer-api.md) · [Integration guide](docs/integration.md) · [Security](docs/security.md) · [Compliance](docs/compliance.md) · [Deployments](docs/deployments.md) · [Contributing](AGENTS.md)

Built for NEAR HACKATHON, tracks `realworld`, `security`, `agents` and `social`.

## License
[MIT](LICENSE)
