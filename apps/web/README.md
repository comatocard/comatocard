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
| Press **Connect wallet** with a testnet wallet (Meteor first; on a desktop, pick it from the list) | **Open a card account**: setup runs full screen, a card on the left builds itself as you go. Each step reads the chain, so a reload resumes where you were. A remembered account that another wallet owns is never opened |
| Step 1, type a name, **Create account** | The card face appears with the name; `<name>.factory.comatocard.testnet` is owned by you, 0.5 NEAR from your wallet |
| Step 2, **Add 100 tUSD** | tUSD minted by the public faucet and deposited; a +100 tUSD chip on the card |
| Step 3, keep the limits, **Issue card** | **You're set**: the card's `VAULT_ID` and `CARD_PRIVATE_KEY`, shown once, with copy, for `apps/agents` |
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
`pnpm test`: token units, the policy form, card spend windows, payment wording, DAO proposals and the 402 checks. `pnpm test:integration`: the server routes in-process against real HTTP servers standing in for the indexer, the relayer and the RPC. `pnpm test:e2e`: Playwright against `next dev` at phone and desktop widths (connect screen, info tips, reduced motion, the redirect away from setup without a wallet); set `E2E_BASE_URL` to reuse a dev server already running, since Next refuses a second one in the same folder.

## Motion
Every change of layout or position runs through GSAP (`src/lib/motion/`): `SmoothHeight` for boxes that grow or shrink, `useStepSwap` and `useReveal` for screens that change, the eases and durations in `gsap.ts`. Each honours `prefers-reduced-motion`. The design source is `design/comatocard.pen` with its Motion spec frame.

## Third-party code
The UI kit (`src/components/ui`, `motion`, `card`, the onboarding styles) comes from the frontend owner's earlier card app, written in October 2026 before the hackathon window: baseline under Q-005. `card-folder` and `digit-swap` are vendored from beUI (MIT). Thinking indicator: `thinking-orbs` (MIT). Font: Switzer (Fontshare).
