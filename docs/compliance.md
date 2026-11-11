# Compliance readiness

Comatocard is built so that a business, a DAO or an auditor can answer "who spent what, on whose authority, and why was anything blocked" from records nobody can edit. This page maps common financial control objectives to what the product does today.

It is not legal advice and not a certification. Comatocard holds no licence and has not been assessed by a regulator or an external auditor. The last section lists what an operator still needs. The research behind this page, per jurisdiction and with sources, is in [`docs/compliance-research.md`](compliance-research.md).

## Roles and custody
| Role | Who | What it controls |
|-|-|-|
| Software publisher | The Comatocard team, publishing open-source code | Nothing in a deployed vault. Vault code is pinned by hash and factory vaults have no full-access key, so no team key can move funds, change policies or upgrade a vault |
| Vault owner | A person, a company or a DAO | Its own vault: cards, policies, approvers, withdrawals. A DAO spending its own treasury is a user. An owner that issues cards over its vault to third parties as a business takes on a service role of its own |
| Card holder | A person or an AI agent | Spending within the card policy with a key that can call only `pay` |
| Hosted operator | Whoever runs the dashboard, the relayer or the indexer for others | Its servers. The relayer sponsors only owner actions signed by the owner, never card payments, holds no vault keys and takes no fee in the transferred token |
| Merchant | The account paid | Its own books and its own obligations to accept a given asset |

Duties follow control: a hosted operator that holds card or approver keys for clients, takes fees from transfers, settles to merchants or serves EU, UK, Singapore or Hong Kong customers needs to check the licensing rules summarised in the research.

## Indonesia
Comatocard is not offered for paying Indonesian merchants in stablecoins for domestic sales. UU 7/2011 Art. 21 requires rupiah for every payment transaction in Indonesia (Art. 33 sets penalties of up to one year and Rp200 million), and Bank Indonesia bars payment service providers from processing virtual currency. The intended flows are cross-border payments, agent-to-API payments and treasury spending, and payments to merchants whose jurisdiction permits them.

## About the word "card"
A Comatocard card is a scoped NEAR access key, not a payment, debit or credit card. There is no card number, no card network and no affiliation with any network, so PCI DSS does not apply. There are no chargebacks, balances are not insured or government backed, and the issuer of a stablecoin may be able to freeze balances of its token. The FATF exemption for card purchases does not apply either: a card payment here is a transfer of virtual assets.

## The registry and who holds its keys
On testnet the registry owner and its only curator is `comatocard.testnet`, a team account. A production registry should be owned by a DAO or by the operator that runs screening, with curators named publicly. The registry is a counterparty signal. Curators can file `sanctions` reports whose evidence names the list and the listing date (`sanctions:OFAC-SDN:2026-03-21`, also `UN`, `EU`, `UK-OFSI`, `DTTOT`, `DPPSPM`); the indexer then answers `block` with reason `sanctions_listed`. Keeping those entries current is the curator's job, since no on-chain sanctions oracle covers NEAR.

## Personal data
Card labels, payment memos and references are public and permanent on-chain and cannot be erased. Do not put names, emails, phone numbers or national ids in them; use an opaque or hashed reference and keep the invoice off-chain. The SDK helper `publicTextWarnings` flags fields that look like personal data, and `cardWarnings` flags agent cards that run without counterparty checks.

## Control objectives
| Objective | How Comatocard supports it | Where |
|-|-|-|
| Spend controls | Every card has limits per transaction, per UTC day and per 30-day period, a validity window, merchant allow or deny lists and an approval threshold, enforced by the contract on every payment | `docs/specs/vault-contract.md`, Policy |
| Segregation of duties | Card holders spend; approvers with their own maximum amounts approve or decline queued payments; only the owner changes policies, freezes or revokes. Ownership can sit with a Sputnik DAO, so changes need a council vote | Vault owner methods, `vault/tests/dao.rs` |
| Authorization record | Each approval names its approver on-chain (`payment_approved`, `payment_declined`), and the approver's limit is checked at approval time together with the TTL, the card validity window and the merchant rule | `docs/specs/events.md` |
| Complete audit trail | Every attempt is an on-chain event, including rejections with their reason (`per_tx_limit`, `merchant_not_allowed`, `queue_full`, and others) and failures with their cause. Every payment id ends in exactly one terminal event | `docs/specs/events.md` |
| Tamper evidence | Records are NEAR receipts with transaction hashes. The rules cannot be changed after creation: vault code is pinned by hash and has no admin key | `docs/security.md` |
| Reconciliation | Payments carry a `reference` (invoice or HTTP 402 challenge id) and a `memo`. Merchants confirm payments by reference; the indexer exports an RFC 4180 CSV with UTC dates, token units, raw amounts, status, queue cause, reason, reference, memo, payment id and transaction hash, and on request a fiat value at a rate the operator names (for Indonesian tax, for example the Bank Indonesia JISDOR rate) | `docs/specs/indexer-api.md` |
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
