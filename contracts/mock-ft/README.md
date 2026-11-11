# contracts/mock-ft

tUSD, a NEP-141 test stablecoin with six decimals for testnet. Any registered account can mint up to 10,000 tUSD per call. Never deployed to mainnet.

## Use
- Register: `storage_deposit` with 0.00125 NEAR attached.
- Mint: `mint({ "account_id": "<you>.testnet", "amount": "100000000" })` mints 100 tUSD.

Testnet: `tusd.comatocard.testnet`. Full commands in [deployments](../../docs/deployments.md).
