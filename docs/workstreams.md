# Workstreams

Who builds what, in which order, and what "done" means. Each task becomes a GitHub issue with one `type:*` and one `area:*` label. Replace the owner placeholders with GitHub handles once the team confirms the split.

| Workstream | Owner | Areas |
|-|-|-|
| A. Contracts and indexer | `@owner-a` | `contracts/*`, `apps/indexer`, `packages/sdk` (types and schemas) |
| B. Agents and services | `@owner-b` | `apps/agents`, `apps/relayer`, treasury and AI integrations |
| C. Product and infrastructure | `@owner-c` | `apps/web`, `apps/merchant`, monorepo tooling, CI, SonarQube, README, demo |

## Interfaces between workstreams
The specs are the contract. Agree on them first, then build in parallel against mocks.
- `docs/specs/vault-contract.md`: A writes, B and C consume.
- `docs/specs/events.md`: A writes, the indexer, the web app and the merchant consume.
- `docs/specs/indexer-api.md`: A writes, B and C consume.
- `packages/sdk`: A publishes types, event schemas and the vault client; B and C import it, never redefine it.

## Milestones
Each milestone ends with a demo of the full path on testnet, not with isolated parts.

### M0. Foundation
| Owner | Task | Done when |
|-|-|-|
| C | Monorepo: pnpm workspaces, Turborepo, Biome, shared tsconfig, lefthook with commitlint | `pnpm turbo lint test build` passes on a clean clone |
| C | CI on GitHub Actions: lint, test, build, clippy, rustfmt, SonarQube Cloud scan on every PR | Required checks block merging |
| A | Cargo workspace for `contracts/*`, `mock-ft` deployed on testnet | Mock USDC mintable by the team on testnet |
| A | Specs reviewed and merged | B and C approved the three spec PRs |
| B | Agent runtime skeleton: config, key loading from env, structured logs | An agent reads a card key and prints the vault config |

### M1. Core payment path
| Owner | Task | Done when |
|-|-|-|
| A | Vault: init, deposits, cards, policy checks, `pay`, ledger, events, `preview_payment` | Unit and sandbox tests cover every reject reason |
| A | Factory with global contract code | A vault is created on testnet in one call |
| A | Indexer: neardata poller, event validation, projections, REST for vaults, cards and payments | Payments appear in the API within seconds of finality |
| B | Spending agent pays the merchant with its card key | Agent pays, event appears in the indexer |
| C | Merchant app: HTTP 402 resource that unlocks after a matching `payment_settled` | Agent receives the paid resource |
| C | Web: wallet login, create vault, create card, card list with spend | A judge creates a vault and a card from the browser |

### M2. Control and security
| Owner | Task | Done when |
|-|-|-|
| A | Approval queue, approver tiers, expiry, freeze, revoke, rotate | Sandbox tests for every tier and transition |
| A | Registry contract and vault risk modes | Blocked merchant is rejected on-chain |
| A | Indexer risk endpoint and WebSocket stream | `/risk/:account` returns a verdict with reasons |
| B | Agent-side guard: preview, risk check, refuse on block, ask a human on warn | Guard logs its decision for each payment |
| B | Attack demo: a prompt-injected agent tries to pay a blocked address | Scripted run shows the rejection on-chain and in the log |
| C | Web: approvals inbox, freeze and revoke, live feed with rejection reasons | Owner approves a queued payment from a phone-sized screen |

### M3. Gasless owners and DAOs
| Owner | Task | Done when |
|-|-|-|
| B | Relayer for owner meta transactions with receiver and method allowlist | Owner freezes a card without holding NEAR |
| A | Sputnik DAO as owner: sandbox test with a `FunctionCall` proposal | A DAO proposal approves a queued payment |
| C | Web: DAO-owned vault view, proposal links | Council member sees and acts on pending proposals |

### M4. Treasury and AI
| Owner | Task | Done when |
|-|-|-|
| B | Treasury agent: keep a stablecoin buffer per card, quote through 1Click with a slippage limit, dry-run by default | Dry run prints the plan; one small mainnet swap is recorded |
| B | Policy assistant on NEAR AI Cloud: natural language to a policy proposal, attestation verified and shown | Owner signs the proposed `update_policy` |
| A | Indexer: CSV export and analytics | CSV opens cleanly in a spreadsheet |
| C | Web: treasury panel, policy assistant UI, "Verified in TEE" panel | Flow works end to end on testnet |

### M5. Stretch
- Cards as NEP-171 tokens: transferring the token rotates the card key to the new holder (`nfts`).
- Credit mode through Rhea lending, behind a feature flag (`defi`).
- Private spending auditor on NEAR AI Cloud (`privacy`).
- Ping Agent Pay for merchants that want payers on Base.
- List the spending agent on Agent Market.

### M6. Submission
| Owner | Task |
|-|-|
| C | README rewritten for judges: problem, "do X, see Y" walkthrough, dry-run path, third-party code list |
| C | Hosted demo, kept up until at least 2026-11-25 |
| All | Demo video and X post draft (humans post it) |
| All | Repository made public and submission sent after the team confirms the payload |

## Definition of done for every task
- Issue linked, PR labeled, CI green, SonarQube quality gate passed.
- Tests for the behaviour; specs updated in the same PR if an interface changed.
- No secrets, no AI attribution, writing rules from `AGENTS.md` followed.
