# contracts/registry

Counterparty registry. Anyone files a report about an account with evidence and pays for its storage; curators appointed by the owner set the account status to `clear`, `flagged` or `blocked`, citing reports. Vaults read `get_status` before paying when a card's risk mode asks for it.

## Contents
| Module | Purpose |
|-|-|
| `reports.rs` | `report`, with storage paid by the reporter and a limit per account |
| `sanctions.rs` | Curator-only sanctions reports: `sanctions:<LIST>:<YYYY-MM-DD>[:<ref>]` for OFAC-SDN, UN, EU, UK-OFSI, DTTOT, DPPSPM |
| `curation.rs` | Curators and `set_status` |
| `views.rs`, `types.rs`, `events.rs` | Views, stored types, `report_submitted` and `status_changed` |

## Build and test
- `pnpm turbo run build --filter=./contracts/registry`
- `cargo test -p registry --lib`; `cargo test -p registry --tests` for near-sandbox.

Testnet: `registry.comatocard.testnet`. The registry is a counterparty signal, not a sanctions list; see [compliance](../../docs/compliance.md).
