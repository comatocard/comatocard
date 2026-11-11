# contracts/vault

The vault contract. It holds NEP-141 tokens, issues cards as function-call keys that can call only `pay`, enforces each card's policy, runs the approval queue and the registry check, and emits a NEP-297 event for every state change.

## Contents
| Module | Purpose |
|-|-|
| `policy.rs` | Pure policy evaluation: status, window, merchant rule, limits, threshold |
| `payments/` | `pay`, approvals, settlement callbacks, the per-card queue |
| `cards.rs` | Card issuance, policy updates, freeze, revoke, key rotation |
| `nft/` | Cards as NEP-171 tokens on `near-contract-standards` |
| `ledger.rs`, `owner.rs`, `views.rs` | Deposits and withdrawals, ownership and approvers, views |
| `events/` | Event payloads and emitters; golden fixtures pin their JSON |

## Build and test
- `pnpm turbo run build --filter=./contracts/vault` writes `target/near/vault/vault.wasm`.
- `cargo test -p vault --lib` runs the unit tests; `cargo test -p vault --tests` runs the near-sandbox tests (build first).

On testnet the code is published by hash from `factory.comatocard.testnet`; see [deployments](../../docs/deployments.md). Specification: [vault contract](../../docs/specs/vault-contract.md).
