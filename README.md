<img src="apps/web/public/comatocard-icon.svg" alt="Comatocard" width="72" height="72">

# Comatocard

**Programmable payment cards for people and AI agents, enforced by smart contracts on NEAR.**

[![CI](https://github.com/comatocard/comatocard/actions/workflows/ci.yml/badge.svg)](https://github.com/comatocard/comatocard/actions/workflows/ci.yml) [![Docs](https://github.com/comatocard/comatocard/actions/workflows/docs.yml/badge.svg)](https://docs.comatocard.xyz) [![Release](https://img.shields.io/github/v/release/comatocard/comatocard)](https://github.com/comatocard/comatocard/releases) [![NEAR testnet](https://img.shields.io/badge/NEAR-testnet-00ec97)](docs/deployments.md) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[App](https://app.comatocard.xyz) · [Website](https://comatocard.xyz) · [Documentation](https://docs.comatocard.xyz) · [Indexer GraphQL](https://indexer.comatocard.xyz/graphql) · [Testnet deployment](docs/deployments.md)

> Everything runs on NEAR testnet with tUSD, a test stablecoin: no real money moves. The app, the demo merchant, the indexer and the relayer are hosted and stay up through judging.

## Overview
AI agents increasingly need to pay for APIs, data and services, but handing an agent a wallet hands it the whole balance. Comatocard gives it a card instead.

A Comatocard vault is a self-custodial NEAR account that holds stablecoins and issues cards. A card is a NEAR access key that can call only `pay`, bound to its own spending policy. The vault checks that policy on every payment and records every attempt, including each rejection and its reason, as an on-chain event. An agent spends on its own, inside limits it cannot change.

## Features
| Feature | What it does |
|-|-|
| **Cards for agents** | Each card has limits per payment, per day and per 30 days, merchant allow and deny lists, an approval threshold and a validity window. Payments above the threshold wait for a human or a DAO vote. |
| **Cards as tokens** | Every card is a NEP-171 token. Transferring it hands the card to the new holder and deletes the old key. |
| **Counterparty checks** | An on-chain registry of evidence-backed reports and curator statuses, including sanctions listings, is checked before a payment settles. |
| **Gasless owner actions** | A relayer sponsors owner calls signed as delegate actions, so freezing or updating a card costs the owner no NEAR. |
| **Payments over HTTP 402** | A merchant answers `402 Payment Required` with a challenge; an agent pays it with its card and the merchant unlocks on settlement. |
| **Books that reconcile** | A Rust indexer serves the payment history, approvals and risk verdicts over REST, WebSocket and GraphQL, plus an accountant CSV with optional fiat valuation. |

## How a payment works
1. The agent calls `pay` on the vault with its card key: merchant, amount and reference.
2. The vault checks the card policy: status, validity window, merchant lists and the per payment, daily and 30-day limits.
3. The vault asks the registry about the merchant. A blocked account, a registry error or a missing answer ends in a recorded rejection.
4. Below the approval threshold the vault transfers the stablecoin and emits `payment_settled`. Above it the payment waits for the owner or the DAO approvers.
5. The indexer reads every event from the chain and serves it to the app, the agent guard and the accountant export.

## Security and compliance
- **The contract is the control.** Policies are enforced on-chain; a card key cannot withdraw, change limits or approve.
- **Fails closed.** Registry errors, missing checks and full queues end in a recorded rejection, never a silent payment.
- **Independently reviewed.** A security review found three high issues; all are fixed in vault 0.4.0 with regression tests. See [Security model](docs/security.md).
- **Built for the rules where it runs.** Sanctions reports name their official list, approvals name their approver, and the docs map each control to local and global rules. Comatocard is not offered for paying Indonesian merchants in stablecoins for domestic sales, as the Currency Law requires rupiah. See [Compliance readiness](docs/compliance.md) and [Compliance research](docs/compliance-research.md).

## Live deployment
| Component | Where |
|-|-|
| Owner app | https://app.comatocard.xyz |
| Website and HTTP 402 demo merchant | https://comatocard.xyz, https://comatocard.xyz/shop |
| Documentation | https://docs.comatocard.xyz |
| Indexer, GraphQL explorer | https://indexer.comatocard.xyz/graphql |
| Relayer | https://relayer.comatocard.xyz/health |
| Contracts | `factory.comatocard.testnet`, `registry.comatocard.testnet`, `tusd.comatocard.testnet` |

Contract code is the reproducible build attached to [release v0.4.1](https://github.com/comatocard/comatocard/releases/tag/v0.4.1). Every testnet transaction checked so far, including a rejection, an approval and a card handover, is listed in [docs/deployments.md](docs/deployments.md).

## Try it
### In the browser
You need a NEAR testnet wallet such as [Meteor](https://wallet.meteorwallet.app) or [MyNearWallet](https://testnet.mynearwallet.com), and a little testnet NEAR from the [faucet](https://near-faucet.io).

1. **Open the app.** Go to https://app.comatocard.xyz and connect the wallet. Setup creates your vault, mints test tUSD and deposits it, then issues a first card with its limits.
2. **See the card and its limits.** Home shows the balance and the card; open the card to see today's spend against its daily limit, its policy and its key.
3. **Act as the owner without gas.** Freeze the card from its page: the relayer sponsors the call, so your NEAR balance stays unchanged, and the card shows `Frozen`.
4. **Pay a merchant over HTTP 402.** https://comatocard.xyz/shop is a demo merchant: it answers `402 Payment Required` with a challenge and the agent command that pays it. Run that command with a card key from `apps/agents`, and the page unlocks once the payment settles, with a link to the transaction.

### From the command line
Requirements: Node 24 with pnpm, Rust from `rust-toolchain.toml` with [cargo-near](https://github.com/near/cargo-near), and Docker.

1. **Build and test everything.** `pnpm install && pnpm build && pnpm test` builds the contracts and apps and runs the unit tests. `pnpm test:integration` runs the near-sandbox and Postgres tests.
2. **See a vault on testnet.** `near contract call-function as-read-only v5.factory.comatocard.testnet get_config json-args '{}' network-config testnet now` returns the owner, the registry and `contract_version` `0.4.0`.
3. **See a payment that settled.** Open `https://testnet.nearblocks.io/txns/7nK8SHcVnQWgDjeng4ozKgUA7ueGMRei5d6FSyZmbVmR`: a card paid 1 tUSD after an on-chain registry check (`payment_submitted`, `payment_settled`).
4. **Query the live indexer.** Open https://indexer.comatocard.xyz/graphql and run `{ cards(vault: "v5.factory.comatocard.testnet") { cardId label status } payments(vault: "v5.factory.comatocard.testnet") { items { status amount merchant reference } } }`: card 0 is active and the payment above is `settled`. The same data is at `https://indexer.comatocard.xyz/vaults/v5.factory.comatocard.testnet/payments`.
5. **Index it yourself.** `docker compose -f apps/indexer/docker-compose.yml up --build` starts Postgres and the indexer on testnet; `curl localhost:4000/health` shows the indexed height and the lag. Events from then on appear under `/vaults/<vault>/payments` and in `/vaults/<vault>/export.csv`.
6. **Pay from an agent.** `apps/agents` holds a card key and pays through its guard: preview, risk verdict, and human confirmation on a warning. See [apps/agents](apps/agents/README.md).
7. **Act as an owner without NEAR.** `pnpm owner-call <vault> freeze_card '{"card_id":0}'` in `apps/relayer` freezes a card while the owner balance stays unchanged. The relayer refuses card payments, other contracts and senders that are not the owner. See [apps/relayer](apps/relayer/README.md).

## For AI agents
- **Docs for models:** [llms.txt](https://docs.comatocard.xyz/llms.txt) indexes every page; [llms-full.txt](https://docs.comatocard.xyz/llms-full.txt) holds the whole documentation in one file.
- **MCP server:** `apps/agents` serves a card as MCP tools over stdio (`card_status`, `preview_payment`, `check_merchant`, `payment_history`, `pay`), with the payment guard in front of `pay`. See [apps/agents](apps/agents/README.md#mcp-server).
- **Agent skill:** [`skills/comatocard`](skills/comatocard/SKILL.md) teaches a model to pay with a card, answer HTTP 402 challenges and refuse injected payment instructions.

## Repository
| Path | Purpose |
|-|-|
| [`contracts/vault`](contracts/vault) | Vault: cards, policies, approvals, payments, card tokens |
| [`contracts/factory`](contracts/factory) | Creates vaults from the published global vault code |
| [`contracts/registry`](contracts/registry) | Counterparty registry with reports, curators and sanctions listings |
| [`contracts/mock-ft`](contracts/mock-ft) | tUSD, the testnet stablecoin |
| [`apps/indexer`](apps/indexer) | Rust indexer: REST, WebSocket, GraphQL, risk verdicts, CSV export |
| [`apps/agents`](apps/agents) | Spending agent with its guard |
| [`apps/relayer`](apps/relayer) | Meta transaction relayer for owner actions |
| [`apps/web`](apps/web) | Owner app and the HTTP 402 demo merchant (`/shop`) |
| [`apps/docs`](apps/docs) | Documentation site, generated from `docs/` |
| [`packages/sdk`](packages/sdk) | Types, event schemas, vault client and compliance helpers |
| [`packages/config`](packages/config) | Shared TypeScript and lint configuration |

## Documentation
[Architecture](docs/architecture.md) · [Vault contract](docs/specs/vault-contract.md) · [Events](docs/specs/events.md) · [Indexer API](docs/specs/indexer-api.md) · [Integration guide](docs/integration.md) · [Security](docs/security.md) · [Compliance](docs/compliance.md) · [Deployments](docs/deployments.md) · [Contributing](AGENTS.md)

## Hackathon
Built for NEAR HACKATHON, tracks `realworld`, `security`, `agents` and `social`.

### Third-party code and tools
Listed for the hackathon rules (Q-005). The repository starts on 2026-11-09, inside the hackathon window; there is no code from before it.

| Area | Libraries |
|-|-|
| Contracts | `near-sdk`, `near-contract-standards`; tests on `near-sandbox` and `near-api` |
| Indexer | `tokio`, `axum`, `sqlx`, `reqwest`, `async-graphql`, `tracing`; tests on `testcontainers` |
| SDK, agents, relayer | `near-api-js`, `zod`, `pino`, `borsh` |
| Web app | Next.js, React, `@hot-labs/near-connect`, TanStack Query, Tailwind CSS, GSAP, Lenis, Lucide |
| Docs site | Next.js, Nextra, MUI, Emotion, Tailwind CSS, Motion, Shiki, Pagefind |
| Tooling | `cargo-near`, NEAR CLI, pnpm, Turborepo, Biome, ESLint with SonarJS, Vitest, Playwright, cargo-deny |

- **Templates:** the docs site layout, components, illustrations and article icons come from [zeta-chain/docs](https://github.com/zeta-chain/docs) (MIT, notice in [`apps/docs/LICENSE`](apps/docs/LICENSE)); its content, branding and services are removed. The official NEAR agent skills from [near/agent-skills](https://github.com/near/agent-skills) are vendored in `.agents/skills`.
- **Services:** NEAR testnet RPC, neardata by FastNEAR for blocks, NEAR Intents 1Click for treasury quotes and swaps, NEAR AI Cloud for the policy assistant, Vercel for the web app, GitHub Pages for the docs, GHCR and Coolify for the indexer, a team VPS behind Caddy for the relayer.
- **AI-written code:** much of the code, tests and documentation was written with AI coding assistants and reviewed, tested and merged by the team through labelled pull requests.

### Other projects
Disclosed for the hackathon rules (Q-015). Axel ([@Lexirieru](https://github.com/Lexirieru)) also builds [Hellonear](https://github.com/Hellonear-AI/hellonear) at NEAR HACKATHON. The two projects are independent and share no code.

## License
[MIT](LICENSE)
