# apps/web

Owner app and demo merchant (Next.js). An owner connects a NEAR wallet, creates a vault, issues cards with their limits, approves or declines queued payments, freezes, rotates or revokes cards, asks the policy assistant for new limits (answered in a TEE on NEAR AI Cloud and verified before it is shown), and reads every payment with its reason. `/shop` is a merchant that sells a resource over HTTP 402.

Workstream C. It reads the vaults over RPC with `@comatocard/sdk`, the history from the [indexer API](../../docs/specs/indexer-api.md), sends owner actions gasless through [apps/relayer](../relayer/README.md), and reuses the policy assistant and treasury planner of [apps/agents](../agents/README.md).

## Run locally
1. Start the indexer (`apps/indexer/README.md`) and, for gasless owner actions, the relayer (`apps/relayer/README.md`).
2. `cp apps/web/.env.example apps/web/.env.local`, then set `INDEXER_URL`, `NEXT_PUBLIC_INDEXER_WS_URL` and `RELAYER_URL`. `NEAR_AI_API_KEY` enables the policy assistant, `TREASURY_ACCOUNT` (an existing mainnet account, used only to quote) enables the treasury panel.
3. `pnpm turbo run build --filter=@comatocard/web^...`, then from `apps/web`: `pnpm dev`, and open `http://localhost:3000`.

## Try it
| Do | See |
|-|-|
| Skip the tour, press **Look around without a wallet** | The testnet demo vault, read only: its available tUSD, its cards with today's spend, and its history |
| Open a card, press **Ask the assistant**, pick an example | A proposed policy as a before and after list, and **Verified in TEE** with each check (TEE signature, Intel TDX quote, Intel root, key and nonce binding, measured app). Only the owner can sign it |
| Open **Approvals** | Payments waiting above a card's threshold, read from the vault itself. For a vault owned by a Sputnik DAO, its proposals and votes |
| Connect a testnet wallet, **Create a vault** with a name | A new vault `<name>.factory.comatocard.testnet` owned by you, 0.5 NEAR from your wallet |
| **Top up** 100 | tUSD minted by the public faucet and deposited into the vault; Available shows it |
| **New card**, keep the defaults | The card on Home, and its secret key shown once as a `.env` snippet for `apps/agents` |
| On the card, **Freeze** | Signed in the wallet as a delegate action and sent by the relayer: the card shows Frozen and you paid no gas. If the relayer refuses, the app offers to sign it from your wallet |
| Open `/shop` | A 402 challenge with a reference and the `pnpm --filter @comatocard/agents pay ...` command; once that payment settles, the gas report unlocks with its transaction |
| **Account** | Vault details, the treasury dry run with a NEAR Intents 1Click quote when the cards may spend more than the vault holds, and the accountant CSV |

## Server routes
The indexer and the relayer send no CORS headers, so the browser reaches them through same-origin routes. Secrets stay on the server.

| Route | Does |
|-|-|
| `GET /api/indexer/*` | Proxies the indexer read API; any path outside it is 404 |
| `POST /api/relay` | Checks the body is `{ signed_delegate }` and forwards it to the relayer |
| `POST /api/assistant` | Policy assistant on NEAR AI Cloud with response signature and TDX attestation checks; 6 requests per minute per client |
| `GET /api/treasury?vault=` | Treasury dry run with a 1Click quote; nothing is signed |
| `GET /api/shop/report` | HTTP 402 resource; a reference unlocks it once, after a settled payment to the merchant |

## Tests
`pnpm test`: token units, the policy form, card spend windows, payment wording, DAO proposals and the 402 checks. `pnpm test:integration`: the server routes in-process against real HTTP servers standing in for the indexer, the relayer and the RPC.

## Third-party code
The UI kit (`src/components/ui`, `motion`, `card`, the onboarding styles) comes from the frontend owner's earlier card app, written in October 2026 before the hackathon window: baseline under Q-005. `card-folder` and `digit-swap` are vendored from beUI (MIT). Thinking indicator: `thinking-orbs` (MIT). Font: Switzer (Fontshare).
