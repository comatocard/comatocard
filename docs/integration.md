# Building on the contracts, SDK and indexer

For workstreams B (agents, relayer) and C (web, merchant). Everything below runs against the testnet deployment in `docs/deployments.md`.

## Accounts
| Role | Account |
|-|-|
| tUSD test token, public faucet | `tusd.comatocard.testnet` |
| Counterparty registry | `registry.comatocard.testnet` |
| Factory | `factory.comatocard.testnet` |
| Demo vault, owner `comatocard.testnet` | `demo.factory.comatocard.testnet` |
| Demo merchant | `comatocard-shop.testnet` |

Amounts are strings in the token's smallest unit; tUSD has 6 decimals, so `"25000000"` is 25 tUSD.

## Vault lifecycle
1. **Create a vault.** Call `create_vault` on the factory with at least 0.5 NEAR attached: `{ "name": "alice" }`. That creates `alice.factory.comatocard.testnet`, owned by the caller, accepting tUSD and using the registry. Pass `owner` to make another account the owner, for example a DAO. The deposit becomes the vault balance, which pays storage and the gas of card transactions.
2. **Register the vault with tUSD.** Call `storage_deposit` on the token with `{ "account_id": "<vault>", "registration_only": true }` and 0.00125 NEAR, paid by any account. Vaults have no keys of their own, so someone else must pay.
3. **Fund it.** Call `mint` on the token (up to 10,000 tUSD per call, the receiver must be registered), then `ft_transfer_call` to the vault with `msg: ""` and 1 yoctoNEAR. The vault emits `deposit`.
4. **Issue a card.** Generate an ed25519 key pair for the holder, then call `create_card` as the owner with the public key, a label, a kind and a policy (`vaultCalls(vault).createCard(...)` in the SDK). The vault adds a function-call key for `pay` only.
5. **Pay.** The holder signs a transaction with signer `<vault>`, receiver `<vault>`, method `pay`, 100 Tgas and no deposit (`vaultCalls(vault).pay(...)`). The result is `{ "status": "submitted" | "queued" | "rejected", ... }`.

## Rules every client must follow
- **Cards are NEP-171 tokens.** `vaultCalls(vault).transferCard(cardId, receiver)` hands a card to another account and deletes its key; the new holder calls `setCardKey(cardId, publicKey)` with at least 1 NEAR attached, which becomes the key allowance. The owner keeps policy, freeze and revoke.
- **Card payments are never relayed.** The vault identifies the card by `signer_account_pk`; a relayer would replace it with its own key. Sign card transactions directly with the card key.
- **Attach 100 Tgas to `pay`.** The card key allowance (default 1 NEAR) is charged with the prepaid gas of every transaction, about 100 payments per key. Rotate the key with `rotate_card_key` when the allowance runs low.
- **Call `preview_payment` before signing.** It runs the same checks as `pay` without the registry call and costs nothing; agents should not sign payments that are already known to be rejected.
- **Merchants must be registered with the token.** A payment to an unregistered account fails with `payment_failed` and cause `transfer_failed`; the vault releases the funds.
- **Owner methods attach no deposit**, so they can go through the meta transaction relayer (receiver: a factory vault, allowlisted methods, zero deposit).

## Approvals
- Payments above the card `approval_threshold` are queued. The owner, or an approver set with `set_approver(account, max_amount)` whose limit covers the amount, calls `approve_payment` or `decline_payment`. Anyone can call `expire_payment` after the approval TTL (24 hours by default).
- **DAO owner.** Transfer ownership with `propose_owner(<dao>)` from the current owner, then a DAO proposal calling `accept_owner`. Proposals on Sputnik DAO v2:
  - `add_proposal` with `{ "proposal": { "description": "...", "kind": { "FunctionCall": { "receiver_id": "<vault>", "actions": [{ "method_name": "approve_payment", "args": "<base64 JSON>", "deposit": "0", "gas": "150000000000000" }] } } } }` and exactly the DAO proposal bond attached (1 NEAR by default)
  - `act_proposal` with `{ "id": <id>, "action": "VoteApprove", "proposal": <the same kind> }`
  - Tested end to end in `contracts/vault/tests/dao.rs`.

## Counterparty risk
- Cards with `risk_mode` `block_only` or `strict` make the vault ask the registry before paying. `blocked` merchants fail with `merchant_blocked`; in `strict` mode `flagged` merchants are queued with cause `risk_flagged`.
- Agents should also ask the indexer before signing: `GET /risk/<merchant>?vault=<vault>` returns `allow`, `warn` or `block` with reasons; parse it with `riskAssessment` from the SDK. Refuse on `block`, ask a human on `warn`.
- Anyone can file a report on the registry (`report` with category and evidence URI, storage paid by the reporter); curators decide the status.

## SDK (`@comatocard/sdk`)
```ts
import { createVaultClient, parseEventLog, vaultCalls } from "@comatocard/sdk";

const vault = createVaultClient({ rpcUrl: "https://rpc.testnet.near.org", vaultId: "demo.factory.comatocard.testnet" });
const preview = await vault.previewPayment(cardPublicKey, "comatocard-shop.testnet", "5000000");
const call = vaultCalls(vault.vaultId).pay({ merchant: "comatocard-shop.testnet", amount: "5000000", reference: "inv-1" });
// `call` is { receiverId, methodName, args, gas, deposit }: sign it with the card key.
```
Every view response is validated with the same Zod schemas the indexer uses. Import types from the SDK; never redefine them.

## Indexer
Run it with `apps/indexer/README.md`. Endpoints are specified in `docs/specs/indexer-api.md`; the ones the apps need first:
- `GET /vaults?owner=<account>`, `GET /vaults/<vault>`, `GET /vaults/<vault>/cards`, `GET /cards?holder=<account>` for the cards an agent or person received as tokens
- `GET /vaults/<vault>/payments?status=&card=&cursor=` for history including rejections and their reasons
- `GET /vaults/<vault>/approvals` for the approvals inbox
- `GET /vaults/<vault>/export.csv` for accountants
- `WS /stream?vault=<vault>` for the live feed; events arrive after their block is committed

### HTTP 402 confirmation for merchants
1. The merchant answers 402 with an amount and a fresh `reference`, at most 64 bytes.
2. The agent pays with that `reference`.
3. The merchant confirms with `GET /merchants/<merchant>/payments?reference=<reference>` until the row has `status: "settled"`, or subscribes to `WS /stream?merchant=<merchant>` and waits for `payment_settled` with the reference.
