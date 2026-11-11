# Vault contract specification

Status: v1, contract version 0.4.0. Owner: contracts workstream. This file is the interface the indexer, agents and web app build against; change it through a PR first.

## Conventions
- Amounts are `U128` strings in the token's smallest unit.
- Timestamps are `U64` strings in nanoseconds (`env::block_timestamp()`).
- `CardId` is a `u32` assigned by the vault, never reused.
- Public keys use the NEAR string form, for example `ed25519:...`.
- Every state change emits a NEP-297 event defined in `docs/specs/events.md`.

## Types
```rust
pub enum CardKind { Human, Agent, Treasury }

pub enum CardStatus { Active, Frozen, Revoked }

pub enum MerchantRule {
    Any,
    Allow(Vec<AccountId>),
    Deny(Vec<AccountId>),
}

pub enum RiskMode {
    Off,
    BlockOnly,   // reject if the registry status is Blocked
    Strict,      // reject Blocked, queue Flagged for approval
}

pub struct Policy {
    pub token: AccountId,                 // settlement token, must be accepted by the vault
    pub per_tx_limit: U128,
    pub daily_limit: U128,                // fixed UTC day
    pub monthly_limit: U128,              // fixed 30-day period from the Unix epoch
    pub approval_threshold: Option<U128>, // above this, payments are queued
    pub merchants: MerchantRule,
    pub valid_from: Option<U64>,
    pub expires_at: Option<U64>,
    pub risk_mode: RiskMode,
}

pub struct Card {
    pub id: CardId,
    pub label: String,                    // max 64 bytes
    pub kind: CardKind,
    pub public_key: Option<PublicKey>,    // None after a token transfer until the holder sets a key
    pub holder: Option<AccountId>,        // token holder, None means the vault owner
    pub status: CardStatus,
    pub policy: Policy,
    pub spend: Spend,                     // { day, day_spent, period, period_spent }, normalized by the views
    pub created_at: U64,
}

pub enum PaymentDecision {
    Submitted { payment_id: u64 },        // transfer in flight, final result arrives as an event
    Queued { payment_id: u64 },           // waiting for approval
    Rejected { reason: RejectReason },
}

pub enum RejectReason {
    CardFrozen, CardRevoked, CardNotYetValid, CardExpired,
    TokenNotAccepted, AmountZero,
    MerchantNotAllowed,
    PerTxLimit, DailyLimit, MonthlyLimit,
    InsufficientBalance,
}
```

## Initialization
`new(owner: AccountId, accepted_tokens: Vec<AccountId>, registry: Option<AccountId>, approval_ttl: U64)`, called by the factory in the same batch that creates the account.

## Owner methods
Caller must be the owner. Owner methods never require an attached deposit, so they can be relayed as meta transactions.

| Method | Effect |
|-|-|
| `create_card(public_key, label, kind, policy, gas_allowance: Option<U128>) -> CardId` | Adds a function-call key on the vault (receiver: vault, methods: `["pay"]`, allowance in yoctoNEAR, default 1 NEAR) and stores the card. The key is confirmed in a callback: when AddKey fails, for example because the key already exists on the account, the mapping is dropped and `card_key_rejected` is emitted |
| `update_policy(card_id, policy)` | Replaces the policy; spend counters are kept |
| `freeze_card(card_id)`, `unfreeze_card(card_id)` | Status change; frozen cards are rejected with `CardFrozen` |
| `revoke_card(card_id)` | Deletes the access key, status becomes `Revoked`, final |
| `rotate_card_key(card_id, new_public_key, gas_allowance)` | Deletes the old key and adds the new one; refills the allowance |
| `set_approver(account_id, max_amount: Option<U128>)` | Adds, updates or removes (None) an approver |
| `approve_payment(payment_id)` | Owner, or an approver whose limit covers the amount. At least 80 Tgas. Refused after the approval TTL, outside the card validity window, when the card is not active or when the merchant rule no longer permits the merchant |
| `decline_payment(payment_id)` | Owner, or an approver whose limit covers the amount |
| `withdraw(token, amount, receiver_id)` | Transfers from the ledger; reverted in the callback on failure |
| `set_accepted_token(token, accepted: bool)` | Manages accepted tokens |
| `set_registry(registry: Option<AccountId>)` | Sets the counterparty registry |
| `set_approval_ttl(ttl: U64)` | How long a queued payment waits before it can be expired |
| `propose_owner(new_owner)`, `accept_owner()` | Two-step owner transfer; `accept_owner` is called by the new owner. Nothing the previous owner set up keeps acting: every owner-held card is handed over to the new owner (key deleted, queued payments declined, `card_transferred`) and every approver is removed (`approver_set` with null). The new owner issues keys and approvers afresh |

## Card method
`pay(merchant: AccountId, amount: U128, memo: Option<String>, reference: Option<String>) -> PaymentDecision`

`PaymentDecision` is tagged by `status`: `{"status":"submitted","payment_id":0}`, `{"status":"queued","payment_id":0,"cause":"threshold"}` or `{"status":"rejected","reason":"per_tx_limit"}`.

- Requires `predecessor_account_id == current_account_id` and `signer_account_pk` to match an existing card.
- `memo` max 256 bytes, `reference` max 64 bytes (an invoice id or an HTTP 402 challenge id; the merchant matches it against events).
- Checks, in order: card status, validity window, token accepted, amount positive, merchant rule, per transaction limit, daily limit, monthly limit, balance, approval threshold, registry (when risk mode is not `Off`).
- Funds and spend are reserved before any cross-contract call and released if the registry check or the transfer fails.
- `pay` requires at least 80 Tgas, enough for the longest path (registry check 5, registry callback 50, which starts the 10 Tgas transfer and its 25 Tgas callback), so no callback can run out of gas and strand a reservation. Card transactions attach 100 Tgas. The card key allowance (default 1 NEAR) is charged with the prepaid gas of every transaction, so a key covers about 100 payments at the minimum gas price before it must be rotated. The vault account pays this gas.
- A registry error fails the payment closed with cause `registry_unavailable`, and so does a card with risk mode `block_only` or `strict` on a vault without a registry.
- A card has at most 10 payments waiting for approval. A payment that would queue beyond that is rejected with `queue_full`; a strict mode re-queue into a full queue fails with cause `queue_full`.
- In `strict` risk mode a flagged merchant moves a submitted payment back to the queue (`payment_submitted`, then `payment_queued` with cause `risk_flagged`). An approved payment is not queued again.

## Card tokens (NEP-171)
Every card that is not revoked is a NEP-171 token whose `token_id` is the card id as a string. Holding the token grants two rights: transferring it and setting the card key. Policy, freeze, unfreeze, revoke and owner rotation stay with the vault owner, so a holder spends only inside limits it cannot change.

| Method | Effect |
|-|-|
| `nft_transfer(receiver_id, token_id, approval_id, memo)` | Holder only, 1 yoctoNEAR attached, `approval_id` must be null. Moves the token, deletes the card key and declines the queued payments of the card (`payment_declined` with the previous holder as `approver_id`), so the previous holder can no longer pay and nothing it queued can be approved later. Payments in the registry check or the transfer complete normally. A card transferred to the vault owner follows future ownership changes |
| `set_card_key(card_id, public_key)` | Holder other than the owner, at least 1 NEAR attached. Adds the key with the deposit as its gas allowance and deletes the previous key, so a holder funds its own payments |
| `nft_token(token_id)`, `nft_metadata()` | Token with NEP-177 metadata (`title` is the label), contract metadata with symbol `CARD` |
| `nft_total_supply()`, `nft_tokens(from_index, limit)`, `nft_supply_for_owner(account_id)`, `nft_tokens_for_owner(account_id, from_index, limit)` | NEP-181 enumeration over cards that are not revoked |

| `nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)` | Same transfer, then calls `nft_on_transfer` on the receiver. When the receiver returns `true` or fails, `nft_resolve_transfer` gives the token back to the previous holder as a full handover: any key the receiver set is deleted and its queued payments are declined |

The methods implement the `near-contract-standards` traits `NonFungibleTokenCore`, `NonFungibleTokenResolver`, `NonFungibleTokenMetadataProvider` and `NonFungibleTokenEnumeration` and return its `Token` and metadata types; the events are its `NftMint`, `NftTransfer` and `NftBurn`. `create_card` emits `nft_mint`, every transfer emits `nft_transfer` with the memo, `revoke_card` emits `nft_burn`. Approvals (NEP-178) are not offered: `approval_id` must be null. Enumeration pages hold at most 100 tokens.

## Public methods
| Method | Effect |
|-|-|
| `ft_on_transfer(sender_id, amount, msg) -> U128` | Credits the ledger for accepted tokens, returns the full amount for others |
| `expire_payment(payment_id)` | Callable by anyone after the approval TTL; closes the request and emits `payment_expired` |
| `recover_payment(payment_id)` | Callable by anyone after the approval TTL for a payment still waiting for the registry check; releases it with `payment_failed` and cause `registry_unavailable`. A payment whose transfer started is never recovered, since its tokens may have moved |

## View methods
| Method | Returns |
|-|-|
| `get_config()` | Owner, pending owner, accepted tokens, registry, factory, contract version |
| `get_balances()` | Per token: available and reserved |
| `list_cards(from_index, limit)`, `get_card(card_id)`, `get_card_by_key(public_key)` | Cards with current spend |
| `list_payments(from_index, limit)`, `get_payment(payment_id)` | Queued and in-flight payments |
| `list_approvers()` | Approvers and their limits |
| `preview_payment(public_key, merchant, amount) -> PaymentPreview` | Dry run of the checks without the registry call, used by agents before signing: `{"status":"allowed"}`, `{"status":"needs_approval","cause":"threshold"}` or `{"status":"rejected","reason":"..."}` |

## Callbacks (private)
- `on_registry_checked(payment_id)`
- `on_payment_transferred(payment_id)`
- `on_withdraw_transferred(token, amount)`

## Storage
The vault account pays for its own storage. The factory funds the initial balance; the dashboard warns when the vault NEAR balance cannot cover storage and gas for its cards.

## Upgrades
Vaults use global contract code by hash: each vault keeps the code it was created with, and a new code version applies only to vaults created after it is published. Vaults created by the factory have no full-access key, so nobody can change their code. Updating by publisher account would push new code onto existing state, which breaks as soon as a stored type changes (the card layout changed between 0.1 and 0.3), and it would let the publisher change the rules of every vault. A future upgrade path needs versioned state migrations and the owner's consent per vault. `contract_version` in `get_config()` reports the code a vault runs.

## Test plan
- Unit tests for every reject reason and every owner method's access control.
- Integration tests in `near-sandbox`: card key scope, revoke and rotate, transfer failure rollback, concurrent payments, approval tiers, registry modes, DAO as owner.
