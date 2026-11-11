# Comatocard

Programmable payment cards for humans and AI agents, enforced by smart contracts on NEAR.

A Comatocard vault holds stablecoins and issues cards. Each card is a revocable NEAR access key with its own spending policy: limits per transaction, day and period, merchant rules, an approval threshold and counterparty checks. The vault contract enforces the policy on every payment and records each approval, queue and rejection on-chain with a reason. An AI agent can spend on its own, inside limits it cannot change.

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
