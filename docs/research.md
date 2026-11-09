# Research notes

Facts the design depends on, with sources, collected on 2026-11-09. "Unverified" means the docs did not state it; confirm on testnet before building on it.

## NEAR protocol
| Topic | Finding | Source |
|-|-|-|
| Function-call keys | Scoped to one receiver and optional method names, with an optional gas allowance. They cannot attach a deposit. When the allowance is spent the key is unusable and the allowance cannot be raised; rotate the key instead. | https://docs.near.org/protocol/accounts-contracts/access-keys |
| Key management from a contract | A contract can add keys to its own account (`add_access_key_allowance` in near-sdk). | same |
| Signer under meta transactions | With a relayer, `signer_account_id` and `signer_account_pk` are the relayer's. The user is identified only by `predecessor_account_id`. Relayed delegates skip the allowance check. | https://docs.near.org/protocol/transactions/meta-tx |
| Yield and resume | Supported in near-sdk 5.29 (`Promise::new_yield`). A yielded promise waits at most 200 blocks, then the callback receives an error. | https://docs.near.org/smart-contracts/anatomy/yield-resume |
| Storage staking | 1E19 yoctoNEAR per byte (100 kB per NEAR). 770 bytes free per account. Account creation costs 0.007 NEAR. | https://docs.near.org/protocol/storage/storage-staking |
| Global contracts (NEP-591) | Publish once (10 NEAR per 100 kB, burned), then accounts use the code by hash or by publisher account for under 0.001 NEAR. A factory can create `<label>.<factory>` with `use_global_contract_by_account_id`. Created accounts have no access keys. Live on testnet and mainnet according to the factory tutorial (unverified elsewhere). | https://docs.near.org/smart-contracts/global-contracts |
| Chain Signatures | Mainnet signer `v1.signer`; testnet id unverified. Not needed for the core product. | https://docs.near.org/chain-abstraction/chain-signatures |

### Design consequences
1. **Card identity comes from `signer_account_pk`, so card payments are submitted directly with the card key, never through a relayer.** Gas for those transactions is charged to the vault account, so cardholders still never hold NEAR.
2. **Owner approvals use a stored queue, not yield and resume.** 200 blocks is minutes; a human approval can take hours.
3. Each card key has a gas allowance that bounds the damage of a leaked key; the dashboard shows the remaining allowance and offers rotation.
4. Meta transactions are used for owner actions only, through a relayer that accepts calls to vault methods with zero deposit.

## NEAR Intents 1Click
| Topic | Finding |
|-|-|
| API | Base `https://1click.chaindefuser.com/v0`: `GET /tokens`, `POST /quote`, `POST /deposit/submit`, `GET /status?depositAddress=` |
| Quote | Fields include `dry`, `swapType`, `slippageTolerance` (bps), `originAsset`, `destinationAsset`, `amount`, `recipient`, `recipientType`, `refundTo`, `deadline`. NEAR assets use `nep141:<contract>`. |
| Statuses | `PENDING_DEPOSIT`, `KNOWN_DEPOSIT_TX`, `PROCESSING`, `SUCCESS`, `INCOMPLETE_DEPOSIT`, `REFUNDED`, `FAILED` |
| Fees | Without a partner JWT: 0.25%. With a JWT: typically 0.20%, 0.01% on stablecoin routes. |
| Testnet | None. Use small mainnet amounts and `dry: true`. |
| Contract as depositor | Unverified whether a plain `ft_transfer` to the deposit address is sufficient. |

Source: https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart

## Prior art and differentiation
**Agent API / Agent Connect (NEAR Intents)** gives each agent an owner-ruled wallet on NEAR Intents, operated by NEAR Technologies Limited in a TEE. It is a mainnet-only beta. Policies include per-asset limits, USD budgets, destinations, timelock, schedule, freeze and owner approval (on or off).
Source: https://docs.agentsonintents.com/integration/agent-api/policies-and-limits

| | Agent API | Comatocard |
|-|-|-|
| Enforcement | Destinations, budget, timelock and schedule are enforced by the operator's API; other rules by a wallet provider | Every rule in the user's own vault contract, readable on-chain |
| Custody | Operator-run service | Self-custodial vault account owned by a user or a DAO |
| Unit of delegation | One wallet per agent | Many cards per vault, each a revocable access key |
| Approval | All money actions or none | Amount threshold per card, DAO proposals for large amounts |
| Merchants | Destination lists | Allowlist, denylist and a shared counterparty registry |
| Network | Mainnet only | Testnet and mainnet |

## HTTP 402 payments
**Ping Agent Pay** is a hosted x402 v2 facilitator. The payer pays USDC on Base and Ping settles to a NEAR recipient through 1Click. The documented payer is an EVM wallet or an Agent Connect balance. No testnet. API key required. There is no NEAR-native x402 scheme yet (proposal x402 PR #3370 is open).
Source: https://pingpay.gitbook.io/docs/pingpay-api/agent-pay-facilitator

Consequence: our demo merchant implements HTTP 402 with a NEAR-native settlement (the agent pays with its card, the merchant verifies the payment event). Ping is an optional mainnet integration for merchants that want Base payers.

## Rhea lending (Burrow)
Supply is `ft_transfer_call` to the lending contract with `IncreaseCollateral`; borrow goes through `oracle_call` on the price oracle with `Borrow` and `Withdraw` actions. Mainnet contract `contract.main.burrow.near`. A testnet deployment appears in SDK samples (`contract.1689937928.burrow.testnet`) but its status is unverified. Whether a contract account can borrow for itself is unverified.
Source: https://github.com/rhea-finance/burrow-sdk-python

Consequence: credit mode is a stretch goal behind a feature flag.

## Data and infrastructure
| Topic | Finding | Source |
|-|-|-|
| neardata (FastNEAR) | `https://testnet.neardata.xyz`, `https://mainnet.neardata.xyz`; `/v0/block/:h`, `/v0/last_block/final`. Blocks include receipt outcomes with logs. Free tier 180 req/min per IP, polling only. | https://docs.fastnear.com/neardata |
| near-lake-framework | Reads S3, needs AWS credentials, about 18 USD per month in request charges | https://github.com/near/near-lake-framework-js |
| Sputnik DAO v2 | Testnet factory `sputnik-v2.testnet`. `FunctionCall` proposals call any contract; the vault sees the DAO as predecessor. `add_proposal` requires the exact proposal bond. | https://github.com/near-daos/sputnik-dao-contract |
| NEAR AI Cloud | OpenAI-compatible, base `https://cloud-api.near.ai/v1`, all inference in TEEs, attestation verifiable | https://docs.near.ai/cloud/quickstart |
| SonarQube Cloud | Free tier covers private repos up to 50k LOC; Rust supported | https://www.sonarsource.com/products/sonarcloud/pricing/ |
| Testnet USDC | No official testnet USDC found. We deploy our own NEP-141 mock. | |

## Open questions
- [ ] Confirm `signer_account_pk` behaviour for a function-call key on testnet.
- [ ] Confirm global contracts on testnet with a factory deploy.
- [ ] Confirm a function-call key can sign a delegate action (owner relayer path).
- [ ] Rhea testnet status and contract-account borrowing.
- [ ] 1Click deposit from a contract account with `ft_transfer`.
