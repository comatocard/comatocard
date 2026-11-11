# packages/sdk

`@comatocard/sdk`: the shared TypeScript types, event schemas and vault client. Apps import it instead of redefining contract types.

## Contents
- **Types and schemas:** Zod schemas for policies, cards, payments and all vault, factory and registry events, plus `parseEventLog` for NEP-297 log lines.
- **Vault client:** `createVaultClient` for validated views (`getConfig`, `listCards`, `previewPayment`, ...) and `vaultCalls` for function call descriptors (`pay`, `createCard`, `transferCard`, `approvePayment`, `recoverPayment`, ...).
- **Risk:** the `riskAssessment` schema of the indexer `GET /risk/:account`.
- **Compliance helpers:** `publicTextWarnings` flags personal data in labels, memos and references; `cardWarnings` flags agent cards without counterparty checks.

```ts
import { createVaultClient, vaultCalls } from "@comatocard/sdk";

const vault = createVaultClient({ rpcUrl: "https://rpc.testnet.near.org", vaultId: "v4.factory.comatocard.testnet" });
const preview = await vault.previewPayment(cardPublicKey, "comatocard-shop.testnet", "1000000");
const call = vaultCalls(vault.vaultId).pay({ merchant: "comatocard-shop.testnet", amount: "1000000", reference: "inv-1" });
```

## Test
`pnpm test` validates every line of the golden fixtures that the contract tests emit, so a schema change fails until contracts and SDK agree.
