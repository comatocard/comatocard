# Deployments

## Testnet
Deployed with `ROOT_ACCOUNT=comatocard.testnet scripts/deploy-testnet.sh` on 2026-11-10 from branch `chore/23-testnet-deploy` (contracts as of PR #22).

| Contract | Account | Code |
|-|-|-|
| Test stablecoin (tUSD, 6 decimals, public faucet) | `tusd.comatocard.testnet` | `contracts/mock-ft` |
| Counterparty registry, curator `comatocard.testnet` | `registry.comatocard.testnet` | `contracts/registry` |
| Factory, default token tUSD, default registry above | `factory.comatocard.testnet` | `contracts/factory` |
| Vault global contract (by hash), code version 2, contract 0.2.0 with card tokens (PR #32) | `HedzS3czoNHwASMvGiwbugSBCoFzvGtCPFDB2MQ94Q2N` | `contracts/vault` |
| Vault global contract (by hash), code version 1, contract 0.1.0 | `2ePovqGVC4vaATS7nLshj93MRTiWkSrR2afjwTxGDfsU` | `contracts/vault` |
| Demo vault owned by `comatocard.testnet`, code version 1 | `demo.factory.comatocard.testnet` | global vault code |
| Card token demo vault owned by `comatocard.testnet`, code version 2 | `nft.factory.comatocard.testnet` | global vault code |

Demo accounts: `comatocard-shop.testnet` (merchant), `comatocard-council.testnet` (DAO council member), `comatocard-agent.testnet` (agent operator).

### Verify
- `near contract call-function as-read-only factory.comatocard.testnet get_config json-args '{}' network-config testnet now` shows the latest vault code hash above. New vaults use the latest code; existing vaults keep the code they were created with.
- The vault hash equals the base58 SHA-256 of `target/near/vault/vault.wasm` built from the same commit with `pnpm turbo run build --filter=@comatocard/vault`.

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

Explorer: `https://testnet.nearblocks.io/txns/<transaction>`.

### Get test funds
1. Register: `near contract call-function as-transaction tusd.comatocard.testnet storage_deposit json-args '{"account_id":"<you>.testnet","registration_only":true}' prepaid-gas '30.0 Tgas' attached-deposit '0.00125 NEAR' sign-as <you>.testnet network-config testnet sign-with-legacy-keychain send`
2. Mint up to 10,000 tUSD per call: `... tusd.comatocard.testnet mint json-args '{"account_id":"<you>.testnet","amount":"100000000"}' ... attached-deposit '0 NEAR' ...`
