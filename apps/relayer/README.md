# apps/relayer

Meta transaction relayer for owner actions. A vault owner signs a NEP-366 delegate action; the relayer wraps it in a transaction from its own account and pays the gas, so owners act without holding NEAR. Card payments never go through the relayer, and it holds no vault keys.

Workstream B. Rules it follows: [integration guide](../../docs/integration.md) and [compliance](../../docs/compliance.md).

## What it sponsors
A delegate action is sent only when every check passes; otherwise the answer names the reason and nothing reaches the chain.

| Check | Refusal |
|-|-|
| Body is `{ "signed_delegate": "<base64 borsh SignedDelegate>" }` | `malformed` |
| Receiver is a vault of `FACTORY_ID` (`<name>.<factory>`) | `not_a_vault` |
| Every action is a function call to an owner method: `create_card`, `update_policy`, `freeze_card`, `unfreeze_card`, `revoke_card`, `rotate_card_key`, `set_approver`, `approve_payment`, `decline_payment`, `withdraw`, `set_accepted_token`, `set_registry`, `set_approval_ttl` | `action_not_allowed`, `method_not_allowed` |
| No attached deposit | `deposit_not_zero` |
| The ed25519 signature covers the delegate action | `bad_signature` |
| The sender is the vault owner, or an approver for `approve_payment` and `decline_payment` | `not_authorized` |
| A `withdraw` receiver is not `block` on the indexer `GET /risk`; an unreachable indexer refuses | `receiver_blocked`, `risk_unavailable` |

`pay`, `nft_transfer`, `set_card_key`, `propose_owner` and `accept_owner` are never relayed. Request and response schemas are `relayRequest` and `relayResponse` in `@comatocard/sdk`.

## Run locally
1. `cp apps/relayer/.env.example apps/relayer/.env` and set `RELAYER_ACCOUNT_ID` and `RELAYER_PRIVATE_KEY` (any funded testnet account, for example one from `near account create-account sponsor-by-faucet-service`).
2. `pnpm turbo run build --filter=@comatocard/relayer`, then from `apps/relayer`: `pnpm start`. `curl localhost:4100/health` shows `{"status":"ok"}`.
3. Set `OWNER_ACCOUNT_ID` and `OWNER_PRIVATE_KEY` to the owner of a factory vault, then `pnpm owner-call <vault> freeze_card '{"card_id":0}'`. It prints `{"status":"relayed","tx_hash":"...","failure":null}`; `get_card` shows `frozen` and the owner balance is unchanged. `pnpm owner-call <vault> unfreeze_card '{"card_id":0}'` reverts it.
4. The same command signed by an account that is not the owner prints `{"status":"refused","reason":"not_authorized",...}` and the relayer balance is unchanged.

## Deployment
Live at `https://comatocard-relayer.201.18.211.8.sslip.io` (relayer account `comatocard-relayer.testnet`), on the team VPS behind its shared Caddy. `relayer.comatocard.xyz` is added to Caddy once its DNS record points to the VPS. The web app reaches it through `RELAYER_URL`.

1. Code: `git clone https://github.com/comatocard/comatocard.git /opt/comatocard`.
2. Secrets, never through git or the image: `apps/relayer/deploy/.env` with `NETWORK`, `FACTORY_ID`, `INDEXER_URL=https://indexer.comatocard.xyz`, `RELAYER_ACCOUNT_ID` and `RELAYER_PRIVATE_KEY`, mode 600.
3. Start: `cd /opt/comatocard && docker compose -f apps/relayer/deploy/compose.yaml up -d --build`. The container joins the Caddy network `deploy_default` as `comatocard-relayer`.
4. HTTPS: a Caddy site block `reverse_proxy comatocard-relayer:4100`, then `caddy validate` and `caddy reload` in the Caddy container.
5. Check: `curl https://comatocard-relayer.201.18.211.8.sslip.io/health` shows `{"status":"ok"}`.

Update: `git pull && docker compose -f apps/relayer/deploy/compose.yaml up -d --build`. Logs: `docker compose -f apps/relayer/deploy/compose.yaml logs -f relayer`. Top up the relayer account when its balance runs low; each sponsored call costs about 0.0003 NEAR.

## Tests
`pnpm test`: decoding and signature checks on delegates signed with real keys, every refusal, owner and approver authorization, withdraw screening, and the HTTP server.
