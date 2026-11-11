# contracts/factory

Publishes the vault code once as a global contract and creates vaults `<name>.<factory>` that use it, each initialized for its owner. A vault keeps the code hash it was created with, and a failed creation is refunded.

## Contents
| Module | Purpose |
|-|-|
| `code.rs` | `publish_vault_code`, `set_defaults` (owner only) |
| `vaults.rs` | `create_vault` (at least 0.5 NEAR), refund callback, vaults per owner |
| `views.rs`, `events.rs` | `get_config`, `list_vaults`; `vault_code_published`, `vault_created` |

## Build and test
- `pnpm turbo run build --filter=./contracts/factory`
- `cargo test -p factory --lib`; `cargo test -p factory --tests` for near-sandbox.

Testnet: `factory.comatocard.testnet`.
