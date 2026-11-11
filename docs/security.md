# Security model

Comatocard is built security first: the rules that protect the money live in the vault contract, not in the app, the agent or our servers. If every off-chain part were compromised, a card could still only spend what its policy allows.

## Principles
1. **Enforced on-chain, not promised off-chain.** Limits, merchant rules, approval thresholds and counterparty checks run inside the vault on every payment (`contracts/vault/src/policy.rs`). An agent cannot change the limits it spends under.
2. **Least privilege keys.** A card is a function-call access key that can call only `pay` on its own vault, with a capped gas allowance. It cannot withdraw, change policy, approve payments or call any other contract.
3. **Fail closed.** A registry error, a missing registry on a card that asks for checks, a full approval queue and an expired approval window all end in a rejection or failure with a recorded reason, never in a silent payment.
4. **No hidden admin.** Vault code is pinned by hash and factory vaults have no full-access key, so nobody, including the Comatocard team, can change the rules of a vault after it is created (`docs/specs/vault-contract.md`, Upgrades).
5. **Self-custody.** Funds stay in the owner's vault account. There is no pooled custody and no operator key that can move them.

## Threat model
| Threat | Control | Where | Proof |
|-|-|-|-|
| A prompt-injected or compromised agent tries to overspend | Per transaction, daily and period limits, approval threshold, validity window; the key can call only `pay` | `policy.rs`, `cards.rs` | Unit tests for every reject reason; sandbox test `card_key_pays_a_merchant` |
| The agent pays a scam or drainer address | Merchant allow or deny lists; registry statuses checked on-chain in `block_only` and `strict` mode; indexer risk verdict before signing | `payments.rs`, `contracts/registry`, `apps/indexer/src/risk.rs` | `registry/tests/risk.rs`, `blocked_merchant_fails_and_releases`, API test `assesses_counterparty_risk` |
| A stolen card key | Owner freezes, revokes or rotates instantly; revocation deletes the key on-chain | `cards.rs` | `revoked_card_key_is_deleted` (sandbox) |
| Concurrent payments race past a limit | Funds and spend are reserved synchronously before any cross-contract call | `payments.rs` | `concurrent_reservations_cannot_exceed_the_daily_limit` |
| A callback runs out of gas and strands funds | `pay` and `approve_payment` require 80 Tgas; stuck registry checks are recoverable after the TTL | `payments.rs` | `vault/tests/audit.rs` `issue_58_*` |
| A card holder plants an existing account key and later deletes it | Card keys are mapped only after AddKey succeeds | `cards.rs` | `issue_59_*` (unit and sandbox) |
| A holder floods the approval queue to drain vault storage or block a handover | At most 10 queued payments per card, indexed per card | `payments.rs` | `issue_60_*` (unit and sandbox) |
| The previous holder or previous owner keeps spending after a handover | Token transfer and ownership change delete keys, decline queued payments and remove approvers | `nft/mod.rs`, `owner.rs` | `issue_62_*`, `transfer_removes_the_key_until_the_holder_sets_one` |
| A relayer impersonates a card | Card payments are never relayed: the vault identifies the card by the signer key and requires the vault itself as predecessor | `payments.rs` | `pay_requires_the_vault_as_predecessor`, `pay_requires_a_card_key` |
| Tampered or malformed events poison the books | The indexer parses events into the contract crates' own types, dead-letters anything else, and ignores logs of failed receipts | `apps/indexer/src/events.rs` | Golden fixtures shared by contracts, SDK and indexer; `projects_the_scenario` |
| Formula injection through the accountant export | CSV cells that start with a formula trigger are quoted | `apps/indexer/src/api/format.rs` | `escapes_csv_cells` |

## Audit
An independent review of the contracts on 2026-11-11 found three high, four medium and several low issues. The three high issues were reproduced in near-sandbox before they were fixed. All high and medium issues are fixed in vault 0.4.0 (PR #65), each with a regression test named after its issue. The fixed code runs on testnet (`docs/deployments.md`).

Open low issues, accepted for now:
- A payment that is waiting for the registry check while its card changes hands can be queued again afterwards. It still needs an approver.
- Registry report slots per account can be filled with low-quality reports. Curators decide statuses, so this delays reporting but does not change a verdict.
- Tokens sent to a vault with a plain `ft_transfer` instead of `ft_transfer_call` are not credited. This is a property of NEP-141.

## Engineering practice
- Every change lands through a labeled pull request with CI: rustfmt, clippy with pedantic lints and warnings as errors, Biome, TypeScript strict mode, unit tests, integration tests against near-sandbox and a real Postgres, and contract builds.
- Bug fixes ship with a regression test named after the issue (`issue_58_*`, `issue-25-*`); regression tests are never loosened to make CI pass.
- Contract, SDK and indexer agree on events through golden fixtures generated by the contract tests.
- Secrets and key files are kept out of the repository (`.gitignore`, `AGENTS.md`).

## Reporting a vulnerability
Report privately to the maintainers through GitHub private vulnerability reporting, which opens when the repository becomes public. Do not test against vaults you do not own.
