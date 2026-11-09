# Architecture

Status: draft for team review. Changes go through a PR.

## Problem
Giving someone money to spend on your behalf, whether an employee, a family member or an AI agent, means either handing over the whole wallet or approving every payment by hand. Card products solve this with limits, but the limits live in a bank's database and cover humans only. AI agents that pay for APIs, data and compute have no equivalent: a leaked key or a prompt injection can drain the wallet.

## Product
Comatocard is a self-custodial vault on NEAR that issues programmable cards. A card is a revocable NEAR function-call access key bound to a spending policy that the vault contract enforces on every payment. Cards work the same way for humans and AI agents. The owner of a vault is a person or a Sputnik DAO.

One vault holds stablecoins (NEP-141). It issues many cards, each with its own policy, and records every approved, queued and rejected payment on-chain with a reason.

## Concepts
| Concept | Definition |
|-|-|
| Vault | A per-owner NEAR account `<name>.<factory>` running the vault contract. Holds funds, cards, policies and the approval queue. |
| Owner | The account that controls the vault: a user account or a Sputnik DAO. |
| Card | A function-call access key on the vault account, allowed to call only `pay` on the vault. Identified by its public key. |
| Holder | Whoever holds the card's private key: a person's device or an AI agent. |
| Policy | Rules attached to a card: limits, merchant rules, validity window, approval threshold, risk mode. |
| Merchant | Any NEAR account that receives a payment. |
| Approver | An account allowed to approve queued payments up to a configured amount. |
| Registry | A shared counterparty registry contract: reports with evidence, curated block and flag statuses. |

## System overview
```
 Holder (person or agent)                Owner (person or DAO)
        | signs with card key                  | signs, optionally gasless
        v                                      v
 +──────────────────────────────────────────────────────────────+
 | Vault contract (one per owner, global contract code)         |
 |  cards, policies, ledger, approval queue, NEP-297 events     |
 +──────────────────────────────────────────────────────────────+
        | ft_transfer          | check(merchant)        ^ created by
        v                      v                        |
   NEP-141 token         Registry contract        Factory contract
        |
        v
     Merchant

 NEAR testnet/mainnet blocks
        | neardata polling
        v
 Indexer: events -> Postgres projections -> REST + WebSocket
        ^                         ^
        | risk signals            | history, live feed, CSV
 Agents (spender, treasury, policy assistant)    Web app (dashboard, approvals, merchant checkout)
        |
        v
 Relayer (meta transactions for owner actions only)
```

## Repository layout
```
apps/
  web/        Next.js app: owner dashboard, card management, approvals, merchant checkout
  merchant/   Demo merchant: HTTP 402 resource server and payment verification
  agents/     Spending agent, treasury agent, policy assistant, attack demo
  indexer/    Block poller, event projections, REST and WebSocket API
  relayer/    Meta transaction relayer for owner actions
contracts/
  vault/      Vault contract (Rust, near-sdk)
  factory/    Creates vault accounts using the global vault code
  registry/   Counterparty registry
  mock-ft/    NEP-141 test stablecoin for testnet
packages/
  sdk/        Shared TypeScript types, event schemas and the typed vault client
  config/     Shared tsconfig and tool presets
docs/         Architecture, specs, workstreams, research
```

## Key decisions
1. **Policies are enforced on-chain only.** No off-chain policy engine. Finality on NEAR is about one to two seconds, which is acceptable for card authorization in this product. One source of truth makes every claim verifiable.
2. **A card is a function-call access key on the vault account.** The key may call only `pay` on the vault. The contract identifies the card with `env::signer_account_pk()` and requires `predecessor_account_id == current_account_id`. Revocation deletes the key.
3. **Card payments are submitted directly, never through a relayer.** A relayer would replace `signer_account_pk` with its own key. Gas for a card transaction is charged to the vault account, so holders never need NEAR.
4. **Rejections are recorded, not reverted.** `pay` returns a decision and emits `payment_rejected` with a reason code instead of panicking. The audit trail is part of the product. The gas cost of rejected attempts is bounded by the card key's allowance.
5. **Limits are hard ceilings, the approval threshold is soft.** A payment above a limit is rejected. A payment within limits but above the approval threshold is queued until the owner or an approver decides.
6. **Approvals are stored requests, not yield and resume.** Yield and resume time out after 200 blocks, too short for a human decision. Queued requests expire after a configurable time.
7. **Tiered approvals map onto DAOs.** Small payments settle automatically, mid-size payments need one approver, large payments need the owner. When the owner is a Sputnik DAO, the owner decision is a `FunctionCall` proposal.
8. **One vault per owner, created by a factory from global contract code.** Isolation per owner, cheap creation, single upgrade path through the publisher account.
9. **Funds are accounted in an internal ledger.** Deposits arrive through `ft_transfer_call`. A payment reserves funds and spend before the transfer and releases them in the callback if the transfer fails.
10. **Counterparty checks are layered.** On-chain: the registry status (clear, flagged, blocked) checked by the vault according to the card's risk mode. Off-chain: indexer signals (merchant first seen, prior payments, contract code changes) used by the agent-side guard before signing.
11. **Owner actions can be gasless.** The relayer sponsors meta transactions whose receiver is a vault created by our factory, with an allowlist of owner methods and zero attached deposit.
12. **The indexer reads finalized blocks from neardata.** No reorg handling needed; ingestion is idempotent on `(receipt_id, log_index)`.

## Payment flow
```
Holder          Vault                        Registry        Token
  | pay(m, amt)   |                              |              |
  |─────────────> | validate card and policy     |              |
  |               | reject?  -> event, return    |              |
  |               | queue?   -> event, return    |              |
  |               | reserve funds and spend      |              |
  |               | risk mode on? ─────────────> | check(m)     |
  |               | <───────────── status        |              |
  |               | blocked? -> release, event   |              |
  |               | ft_transfer(m, amt) ─────────────────────> |
  |               | <─────────────────────────────── result    |
  |               | success: payment_settled                    |
  |               | failure: release, payment_failed            |
```

Approval flow: an approver or the owner calls `approve_payment(id)`. The vault re-validates the card status and balance, then continues from "reserve funds" above. `decline_payment(id)` closes the request.

## Security model
| Threat | Mitigation |
|-|-|
| Leaked card key | Damage bounded by the card policy and the key's gas allowance; owner freezes or revokes in one transaction |
| Prompt-injected agent pays an attacker | Merchant allowlist, registry block, approval threshold, agent-side guard refuses blocked counterparties |
| Card key calls other methods | The key is scoped to `pay`; owner methods check the predecessor is the owner |
| Gas drain through spam rejections | Per-key allowance; dashboard shows remaining allowance and offers rotation |
| Merchant not registered with the token | Transfer fails, callback releases the reservation and emits `payment_failed` |
| Async race between two payments | Funds and spend are reserved synchronously before any cross-contract call |
| Registry abuse | Reports need evidence; only curators change statuses; vault risk mode is opt-in per card |
| Relayer abuse | Relayer accepts only factory vaults, allowlisted owner methods and zero deposit |
| Owner key loss | DAO ownership or a two-step owner transfer |

## Out of scope for the core
Physical cards and card networks (roadmap: an issuer partner calls an authorization method on the vault), fiat on and off ramps.

## Open items
Tracked in `docs/research.md` under "Open questions" and in `docs/workstreams.md`.
