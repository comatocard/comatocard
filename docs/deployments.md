# Deployments

## Testnet
Deployed with `ROOT_ACCOUNT=comatocard.testnet scripts/deploy-testnet.sh` on 2026-11-10 from branch `chore/23-testnet-deploy` (contracts as of PR #22).

| Contract | Account | Code |
|-|-|-|
| Test stablecoin (tUSD, 6 decimals, public faucet) | `tusd.comatocard.testnet` | `contracts/mock-ft` |
| Counterparty registry, curator `comatocard.testnet`, redeployed 2026-11-11 with sanctions reports (PR #74) | `registry.comatocard.testnet` | `contracts/registry` |
| Factory, default token tUSD, default registry above | `factory.comatocard.testnet` | `contracts/factory` |
| Vault global contract (by hash), code version 5, contract 0.4.0 from the reproducible build of release v0.4.1 (PR #90) | `6XRhVBvaFGBuDqrLzn6EPptBX9e724h85Gw5tHPsGXXU` | `contracts/vault` |
| Vault global contract (by hash), code version 4, contract 0.4.0 built without wee_alloc (PRs #79 #80) | `CQn2sAQtZ87h2v1akv4wnCiLdH4wLHKfCeEXyh1edRED` | `contracts/vault` |
| Vault global contract (by hash), code version 3, contract 0.4.0 with the audit fixes (PR #65) | `6b8ijoAK9QhACv5y8s4UdRwvBNpeUVsX1bBCDLRNC9Ms` | `contracts/vault` |
| Vault global contract (by hash), code version 2, contract 0.2.0 with card tokens (PR #32) | `HedzS3czoNHwASMvGiwbugSBCoFzvGtCPFDB2MQ94Q2N` | `contracts/vault` |
| Vault global contract (by hash), code version 1, contract 0.1.0 | `2ePovqGVC4vaATS7nLshj93MRTiWkSrR2afjwTxGDfsU` | `contracts/vault` |
| Demo vault owned by `comatocard.testnet`, code version 1 | `demo.factory.comatocard.testnet` | global vault code |
| Card token demo vault owned by `comatocard.testnet`, code version 2 | `nft.factory.comatocard.testnet` | global vault code |
| Audited demo vault owned by `comatocard.testnet`, code version 3, card risk mode `block_only` | `audit.factory.comatocard.testnet` | global vault code |
| Demo vault owned by `comatocard.testnet`, code version 4, card risk mode `block_only` | `v4.factory.comatocard.testnet` | global vault code |
| Current demo vault owned by `comatocard.testnet`, code version 5, card risk mode `block_only` | `v5.factory.comatocard.testnet` | global vault code |

Demo accounts: `comatocard-shop.testnet` (merchant), `comatocard-council.testnet` (DAO council member), `comatocard-agent.testnet` (agent operator).

### Verify
- `near contract call-function as-read-only factory.comatocard.testnet get_config json-args '{}' network-config testnet now` shows the latest vault code hash above. New vaults use the latest code; existing vaults keep the code they were created with.
- From release v0.4.1 on, testnet code is deployed from the release assets, built with `cargo near build reproducible-wasm` in the image pinned in each contract's `Cargo.toml`. To check it, check out the release tag, run `cargo near build reproducible-wasm --manifest-path contracts/vault/Cargo.toml` (Docker required) and compare `python3 scripts/code-hash.py target/near/vault/vault.wasm` with the release `CODE_HASHES` asset and the hash on chain.

### End-to-end check on 2026-11-10
| Step | Transaction | Result |
|-|-|-|
| Card pays 5 tUSD, risk mode `block_only` | `AT9XVQkqmYm7NQy7Yo9xMPD6WXBXyFCgm9L1i8NAk9X7` | `payment_submitted`, registry check, `payment_settled` |
| Card pays 25 tUSD above the 20 tUSD limit | `ERacMbSCQAeomY8vhwdGiT9fHf5n9sM8jN5QbqDXT7aP` | `payment_rejected` with `per_tx_limit` |
| Card pays 15 tUSD above the 10 tUSD threshold | `EiAaDgsdH8pDLvoQF2LHDbj5X9cgSxDZncwSLCP8Fv5k` | `payment_queued` with `threshold` |
| Owner approves the queued payment | `FGP1FD75TguUsovGyewwspp75HDbqRYgnFBfPKaxXSoj` | `payment_approved`, `payment_settled` |

### Card handover check on 2026-11-10
Vault `nft.factory.comatocard.testnet`, code version 2, published from main at PR #32.

| Step | Transaction | Result |
|-|-|-|
| Owner issues card 0 | `BXwihezkVNsiwViyKpVCQwhfV8PEQM8qgn8iVnhw8Zy6` | `card_created`, NEP-171 `nft_mint` |
| Owner transfers token 0 to `comatocard-agent.testnet` | `7EbuH5jdjmTcQMihWRVH731cLPuTchDZw3JFzn2MkcKe` | `card_transferred`, NEP-171 `nft_transfer`, old key deleted |
| Agent sets its own key with 1 NEAR allowance | `EDw27sdZovWHwV5PTzw9fVThcLgr5shmQPBbqQeaYdCY` | `card_key_rotated` with `old_public_key` null |
| Agent key pays 3 tUSD | `5FaK2gVUZivVzdWowqSkBJGyzy98uW8iAyHxkGqBbJJZ` | `payment_submitted`, `payment_settled` |

A payment signed with the previous key cannot be sent: the RPC reports that the access key does not exist. `nft_token({"token_id":"0"})` returns owner `comatocard-agent.testnet`.

### Spending agent check on 2026-11-11
Vault `rio74936.factory.comatocard.testnet`, code version 2, card 0 with a 20 tUSD per-transaction limit, a 10 tUSD approval threshold and risk mode `block_only`. Commands from `apps/agents/README.md`.

| Command | Transaction | Result |
|-|-|-|
| `pnpm pay comatocard-shop.testnet 5000000 e2e-ok-1` | `GZVeJ99E5r9RbsCirnK8YQbEw5CtbtducdnhZq1aKvrq` | preview `allowed`, `submitted`, indexer row `settled` |
| `pnpm pay comatocard-shop.testnet 25000000 e2e-limit` | none | preview `rejected` with `per_tx_limit`, refused before signing |
| `pnpm pay comatocard-shop.testnet 15000000 e2e-queue` | `GbHQjy9NHVKaQR1UZ4Phc34qcMMt6jEUaSn5812n5wc2` | preview `needs_approval`, `queued` with `threshold`, listed in `/vaults/<vault>/approvals` |

### Agent guard check on 2026-11-11
Same vault and card, indexer from `apps/indexer` serving `/risk` on `INDEXER_URL`. The registry has no blocked account on testnet yet, so `block` is covered by unit tests.

| Command | Verdict | Guard decision |
|-|-|-|
| `pnpm pay comatocard-shop.testnet 2000000 guard-allow` | `allow` (info: `first_payment`, `never_paid`) | signed, `submitted`, tx `BasH4fUbKwyc7Nnt5VALntqUJNohFeAB3eKJS9SQ8GMk` |
| `pnpm pay nobody-rio-guard.testnet 1000000 guard-warn`, no terminal | `warn` (`account_missing`) | refused by `human`, nothing signed |
| same, on a terminal, answer `n` or Ctrl+D | `warn` | prompt lists the reasons, refused by `human` |
| `pnpm pay comatocard-shop.testnet 1000000 guard-down`, indexer stopped | none | refused by `risk_unavailable`, nothing signed |

### Audit fix check on 2026-11-11
Vault `audit.factory.comatocard.testnet`, code version 3, published from main at PR #65.

| Step | Transaction | Result |
|-|-|-|
| Factory creates the vault | `C4Bm2c9oXCsKCwuRm6amTax6gUdZE4Hv631NRT3Tyzvs` | `vault_created` with `code_version` 3, `get_config` reports 0.4.0 |
| Owner issues a card checked by the registry | `DzMAdcAnGSPMNYtU92X1gqu2nTpCPciC5j6ghs8JTnF1` | Card key confirmed, no `card_key_rejected` |
| Card pays 2 tUSD with 50 Tgas | refused before execution | `attach at least 80 Tgas`, nothing reserved (#58) |
| Card pays 2 tUSD with 100 Tgas | `EYcoFo6RHbcvsjuZZSXzkhLgVovqefWvufKAvnssSzpi` | Registry check, `payment_settled`, `reserved` back to 0 |

### Registry sanctions check on 2026-11-11
Registry code from PR #74 deployed in place (`G9jRNm24QCbkxP9mir2AxFPyWdeW2SDCYZJSjiWUs8ji`). Existing state reads back unchanged: `list_curators` returns `comatocard.testnet` and statuses still resolve. A curator `sanctions` report with evidence `ipfs://not-a-list` is refused with `sanctions evidence must be sanctions:<LIST>:<YYYY-MM-DD>[:<reference>]`, and the same report with valid evidence from a non-curator is refused with `only curators file sanctions reports`. No sanctions report was filed on testnet, so no account carries a false sanctions record.

### Republish without wee_alloc on 2026-11-11
Testnet matches main after PRs #79 and #80. Registry, factory and tUSD code were deployed in place (`ESAmR8pMbx8D6PmPSC4D7i12N9NPxiC1jz1i1Ps7Ws3g`, `P37D8uVC56hnD3FVeVx7pCcFixHDBcbALHAfzeZMJ88`, `5fwW7dEr1wis4WY5ZgdYvbSJpov9zMjo74nLncmJjBwb`); their state reads back unchanged (factory config, registry curators, tUSD balances, vaults on older code versions). The vault code is global contract version 4.

| Step | Transaction | Result |
|-|-|-|
| Owner issues a card checked by the registry on `v4.factory.comatocard.testnet` | `8Ax8CggqyebA3ujP9qmHjyYMppXgtvNHoymwPBzoaTaQ` | Card key confirmed |
| Card pays 1 tUSD with 100 Tgas | `2He3J1YWUs8Vkk2VA9PDYa4yavySHjbRn9sJRwqZcZrA` | Registry check, `payment_submitted`, `payment_settled` |

Explorer: `https://testnet.nearblocks.io/txns/<transaction>`.

### Reproducible republish on 2026-11-12
Every contract on testnet now runs the assets of [release v0.4.1](https://github.com/comatocard/comatocard/releases/tag/v0.4.1), deployed with `RELEASE_WASM=<assets> scripts/deploy-testnet.sh`. Contract source is unchanged from v0.4.0. tUSD, registry and factory were deployed in place and their state reads back unchanged; the on-chain code hashes equal the release `CODE_HASHES`:

| Contract | Code hash |
|-|-|
| `tusd.comatocard.testnet` | `DLqSjb2C1unje3tk9CVR6VS11bXnTYsi97rNzjG8jZeD` |
| `registry.comatocard.testnet` | `8WBR6WNBwiLJRWmF6fhRV1tBQagp7QLB6kD79FTyGiZQ` |
| `factory.comatocard.testnet` | `5HQhYDp1EuT2VCxA7rvKvFviw37HzJYoeYxQ38k5cDAB` |
| Vault global contract, code version 5 | `6XRhVBvaFGBuDqrLzn6EPptBX9e724h85Gw5tHPsGXXU` |

| Step | Transaction | Result |
|-|-|-|
| Factory publishes the vault code | `4Bwzqfu8YSdXvfPMeKxaQtNd2quB5ex3ags8oCsppttZ` | `vault_code_published`, code version 5 |
| Factory creates `v5.factory.comatocard.testnet` | `Ans9jY51W6qZBqex1UgqYvrhacQ4Lx3LA7Hd7oUjtgFy` | `vault_created`, code version 5 |
| Owner issues a card checked by the registry | `7iP8drQZo1S5hFzHv2aLGvPm649uXgK9DSLpUpM5SXbb` | `card_created`, `nft_mint`, key added |
| Card pays 1 tUSD with 100 Tgas | `7nK8SHcVnQWgDjeng4ozKgUA7ueGMRei5d6FSyZmbVmR` | Registry check, `payment_submitted`, `payment_settled` |

### Get test funds
1. Register: `near contract call-function as-transaction tusd.comatocard.testnet storage_deposit json-args '{"account_id":"<you>.testnet","registration_only":true}' prepaid-gas '30.0 Tgas' attached-deposit '0.00125 NEAR' sign-as <you>.testnet network-config testnet sign-with-legacy-keychain send`
2. Mint up to 10,000 tUSD per call: `... tusd.comatocard.testnet mint json-args '{"account_id":"<you>.testnet","amount":"100000000"}' ... attached-deposit '0 NEAR' ...`
