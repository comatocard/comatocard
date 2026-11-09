# Event schema

Status: draft v0. Owner: contracts workstream. The indexer validates every event against the schemas in `packages/sdk`; the contract tests assert the exact JSON.

## Envelope
Events follow NEP-297 and are logged as `EVENT_JSON:{...}`.

```json
{
  "standard": "comatocard",
  "version": "1.0.0",
  "event": "payment_settled",
  "data": [{ "...": "..." }]
}
```

- `data` is always an array with one object.
- Amounts are strings, timestamps are nanosecond strings, `card_id` is a number.
- The emitting account (`executor_id` of the receipt) is the vault, the factory or the registry. The indexer stores it as `contract_id`.
- A breaking change bumps the major version; the indexer supports every major version it has seen.

## Factory events
| Event | Data |
|-|-|
| `vault_created` | `vault_id`, `owner_id`, `code_version` |

## Vault events
| Event | Data |
|-|-|
| `card_created` | `card_id`, `public_key`, `label`, `kind`, `policy` |
| `card_policy_updated` | `card_id`, `policy` |
| `card_frozen`, `card_unfrozen`, `card_revoked` | `card_id` |
| `card_key_rotated` | `card_id`, `old_public_key`, `new_public_key` |
| `approver_set` | `account_id`, `max_amount` (null means removed) |
| `deposit` | `token`, `sender_id`, `amount` |
| `withdrawal` | `token`, `receiver_id`, `amount`, `success` |
| `payment_submitted` | `payment_id`, `card_id`, `merchant`, `token`, `amount`, `memo`, `reference` |
| `payment_queued` | `payment_id`, `card_id`, `merchant`, `token`, `amount`, `memo`, `reference`, `cause` (`threshold` or `risk_flagged`) |
| `payment_approved` | `payment_id`, `approver_id` |
| `payment_declined` | `payment_id`, `approver_id` |
| `payment_expired` | `payment_id` |
| `payment_settled` | `payment_id`, `card_id`, `merchant`, `token`, `amount`, `reference` |
| `payment_failed` | `payment_id`, `card_id`, `merchant`, `token`, `amount`, `cause` (`transfer_failed` or `merchant_blocked`) |
| `payment_rejected` | `card_id`, `merchant`, `token`, `amount`, `reason` (a `RejectReason` in snake case), `reference` |
| `owner_proposed`, `owner_changed` | `owner_id` |

Every `payment_id` has exactly one terminal event: `payment_settled`, `payment_failed`, `payment_declined` or `payment_expired`. A rejected payment stores nothing, so `payment_rejected` carries no `payment_id` and is terminal by itself.

## Registry events
| Event | Data |
|-|-|
| `report_submitted` | `report_id`, `account_id`, `reporter_id`, `category`, `evidence_uri` |
| `status_changed` | `account_id`, `status` (`clear`, `flagged`, `blocked`), `curator_id`, `report_ids` |
