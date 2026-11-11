# Comatocard

Programmable payment cards for humans and AI agents, enforced by smart contracts on NEAR.

A Comatocard vault holds stablecoins and issues cards. Each card is a revocable NEAR access key with its own spending policy: limits per transaction, day and period, merchant rules, an approval threshold and counterparty checks. The vault contract enforces the policy on every payment and records each approval, queue and rejection on-chain with a reason. An AI agent can spend on its own, inside limits it cannot change.

## Security first, compliance ready
- **The contract is the control.** Limits, merchant rules, approvals and counterparty checks run on-chain on every payment. A card key can call only `pay`, so a compromised agent cannot raise its own limits or withdraw.
- **Fails closed, recovers cleanly.** Registry errors, missing checks and full queues end in a recorded rejection, never a silent payment. Freeze, revoke and rotate take effect at once.
- **Audited.** An independent contract review found three high issues; all are fixed in vault 0.4.0 with regression tests and run on testnet. See [Security model](docs/security.md).
- **Built for the rules where it runs.** Sanctions reports name their official list, the accountant CSV values payments at a named fiat rate, and the SDK warns before personal data goes on-chain. Comatocard is not offered for paying Indonesian merchants in stablecoins for domestic sales, as the Currency Law requires rupiah. See [Compliance research](docs/compliance-research.md).
- **Audit trail by default.** Every attempt, including rejections and their reasons, is an on-chain event with a transaction hash. Approvals name the approver, DAOs can own vaults, and the indexer exports an accountant-ready CSV. See [Compliance readiness](docs/compliance.md).

Status: in development for NEAR HACKATHON (tracks `realworld`, `security`, `agents`, `social`). Setup and a judge walkthrough will be added with the first runnable milestone.

## Repository layout
| Path | Purpose |
|-|-|
| `apps/web` | Owner dashboard, card management, approvals, merchant checkout |
| `apps/merchant` | Demo merchant with an HTTP 402 resource |
| `apps/agents` | Spending agent, treasury agent, policy assistant, attack demo |
| `apps/indexer` | Event indexer in Rust with REST and WebSocket API |
| `apps/relayer` | Meta transaction relayer for owner actions |
| `contracts/vault` | Vault contract |
| `contracts/factory` | Vault factory using global contract code |
| `contracts/registry` | Counterparty registry |
| `contracts/mock-ft` | Test stablecoin for testnet |
| `packages/sdk` | Shared types, event schemas, vault client |
| `packages/config` | Shared tool configuration |

## Documentation
- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Compliance readiness](docs/compliance.md)
- [Compliance research, local and global](docs/compliance-research.md)
- [Vault contract specification](docs/specs/vault-contract.md)
- [Event schema](docs/specs/events.md)
- [Indexer API](docs/specs/indexer-api.md)
- [Integration guide](docs/integration.md)
- [Deployments](docs/deployments.md)
- [Workstreams and milestones](docs/workstreams.md)
- [Research notes](docs/research.md)
- [Hackathon rules checklist](docs/hackathon.md)
- [Contributor and agent rules](AGENTS.md)

## License
[MIT](LICENSE)
