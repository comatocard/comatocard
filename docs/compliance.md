# Compliance readiness

Comatocard is built so that a business, a DAO or an auditor can answer "who spent what, on whose authority, and why was anything blocked" from records nobody can edit. This page maps common financial control objectives to what the product does today.

It is not legal advice and not a certification. Comatocard holds no licence and has not been assessed by a regulator or an external auditor. The last section lists what an operator still needs.

## Control objectives
| Objective | How Comatocard supports it | Where |
|-|-|-|
| Spend controls | Every card has limits per transaction, per UTC day and per 30-day period, a validity window, merchant allow or deny lists and an approval threshold, enforced by the contract on every payment | `docs/specs/vault-contract.md`, Policy |
| Segregation of duties | Card holders spend; approvers with their own maximum amounts approve or decline queued payments; only the owner changes policies, freezes or revokes. Ownership can sit with a Sputnik DAO, so changes need a council vote | Vault owner methods, `vault/tests/dao.rs` |
| Authorization record | Each approval names its approver on-chain (`payment_approved`, `payment_declined`), and the approver's limit is checked at approval time together with the TTL, the card validity window and the merchant rule | `docs/specs/events.md` |
| Complete audit trail | Every attempt is an on-chain event, including rejections with their reason (`per_tx_limit`, `merchant_not_allowed`, `queue_full`, and others) and failures with their cause. Every payment id ends in exactly one terminal event | `docs/specs/events.md` |
| Tamper evidence | Records are NEAR receipts with transaction hashes. The rules cannot be changed after creation: vault code is pinned by hash and has no admin key | `docs/security.md` |
| Reconciliation | Payments carry a `reference` (invoice or HTTP 402 challenge id) and a `memo`. Merchants confirm payments by reference; the indexer exports an RFC 4180 CSV with UTC dates, token units, raw amounts, status, queue cause, reason, reference, memo, payment id and transaction hash | `docs/specs/indexer-api.md` |
| Counterparty screening | A registry contract stores evidence-backed reports and curator statuses (`clear`, `flagged`, `blocked`). Cards can require a registry check on-chain, and agents ask the indexer for a risk verdict before signing | `contracts/registry`, `GET /risk/:account` |
| Access revocation | Freeze, revoke and key rotation take effect in the next block. A card handover or an ownership change deletes old keys, declines pending payments and removes approvers | `docs/security.md`, threat model |
| Custody | Self-custodial: funds stay in the owner's vault account, and no Comatocard key can move them | `docs/architecture.md` |
| Data minimisation | The chain stores account ids, amounts, card labels and the optional memo and reference. No names, emails or documents are stored; owners decide what a label or memo contains | Vault events |

## How an auditor checks it
1. `GET /vaults/<vault>/export.csv?from=&to=` gives every payment attempt in the period with its transaction hash.
2. Each hash opens on a public explorer (`https://testnet.nearblocks.io/txns/<hash>`) and shows the event the row came from.
3. `GET /vaults/<vault>/payments/<id>` lists the full history of one payment: submitted or queued, approved by whom, settled or failed and why.
4. `GET /vaults/<vault>/approvals` lists the pending queue and every approver with its limit.
5. The card policy in force is readable from the vault (`list_cards`). `get_config` reports the contract version, and `docs/deployments.md` maps each version to its code hash, which anyone can compare with a build from the same commit.

## What an operator still needs
- **Identity and AML:** know-your-customer checks on vault owners and on merchants, and transaction monitoring, from a provider of their choice. The registry is a counterparty signal, not a sanctions list.
- **Travel Rule:** if the operator is a virtual asset service provider, the exchange of originator and beneficiary data with other providers.
- **Licensing:** whether a licence applies depends on the operator's role and jurisdiction, not on the contract.
- **Record retention:** on-chain events persist, but the indexer database is a projection; operators keep their own exports for the retention period their rules require.
- **Policy review:** owners decide limits and approvers. Comatocard enforces the rules it is given; it does not decide whether they are adequate.
