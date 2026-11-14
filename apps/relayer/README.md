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
| The delegate's `max_block_height` is above the latest final block | `expired` |

When the chain still rejects the wrapping transaction because the delegate expired on the way or its nonce was already used (a double submit), the answer is the same refusal, `expired` or `nonce_used`, with a detail that tells the owner to sign again; the delegated call did not run.

`pay`, `nft_transfer`, `set_card_key`, `propose_owner` and `accept_owner` are never relayed. Request and response schemas are `relayRequest` and `relayResponse` in `@comatocard/sdk`.

## Policy assistant
`POST /assistant` with `{ "vault", "cardId", "request" }` asks a model in a TEE on NEAR AI Cloud for the card's new policy and checks the answer's signature and attestation (`proposePolicy` and `verifiedChat` from [apps/agents](../agents/README.md)). It answers the proposal with the `update_policy` call for the owner to sign; it never signs.

It runs as its own service, `dist/assistant-main.js`, from the same image (#188): the relayer process holds only the gas key and the assistant process only the NEAR AI key, so a flaw on the public, free-text assistant path cannot reach the key that pays gas, and each can be limited and scaled on its own. The assistant answers only `POST /assistant` and `GET /health` (port 4200), the relayer only `POST /relay` and `GET /health`. The web app proxies to `<RELAYER_URL>/assistant`, which Caddy routes to the assistant service.

| Answer | When |
|-|-|
| 200 proposal | The model answered; `kind` is `proposal` or `invalid` |
| 400 | The body is not `{ vault, cardId, request }` with a request of 3 to 500 characters |
| 404 | The vault is not a vault of `FACTORY_ID`, or it has no such card |
| 429 | More than 10 requests a minute from one client, or 30 a minute in total |
| 502 | NEAR AI Cloud did not answer or the answer failed verification |

## Run locally
1. `cp apps/relayer/.env.example apps/relayer/.env` and set `RELAYER_ACCOUNT_ID` and `RELAYER_PRIVATE_KEY` (any funded testnet account, for example one from `near account create-account sponsor-by-faucet-service`).
2. `pnpm turbo run build --filter=@comatocard/relayer`, then from `apps/relayer`: `pnpm start`. `curl localhost:4100/health` shows `{"status":"ok"}`.
3. Set `OWNER_ACCOUNT_ID` and `OWNER_PRIVATE_KEY` to the owner of a factory vault, then `pnpm owner-call <vault> freeze_card '{"card_id":0}'`. It prints `{"status":"relayed","tx_hash":"...","failure":null}`; `get_card` shows `frozen` and the owner balance is unchanged. `pnpm owner-call <vault> unfreeze_card '{"card_id":0}'` reverts it.
4. The same command signed by an account that is not the owner prints `{"status":"refused","reason":"not_authorized",...}` and the relayer balance is unchanged.
5. Assistant: `cp apps/relayer/.env.assistant.example apps/relayer/.env.assistant`, set `NEAR_AI_API_KEY`, then `pnpm start:assistant`. `curl localhost:4200/health` shows `{"status":"ok"}`; it refuses to start without the key.

## Deployment
Live at `https://relayer.comatocard.xyz` (relayer account `comatocard-relayer.testnet`), on the team VPS behind its shared Caddy; `https://comatocard-relayer.201.18.211.8.sslip.io` serves the same container. The web app reaches it through `RELAYER_URL`.

1. Code: `git clone https://github.com/comatocard/comatocard.git /opt/comatocard`.
2. Secrets, never through git or the image, mode 600: `apps/relayer/deploy/.env` for the relayer with `NETWORK`, `FACTORY_ID`, `INDEXER_URL=https://indexer.comatocard.xyz`, `RELAYER_ACCOUNT_ID` and `RELAYER_PRIVATE_KEY`; `apps/relayer/deploy/.env.assistant` for the assistant with `NETWORK`, `FACTORY_ID` and `NEAR_AI_API_KEY`. Neither file holds the other's key.
3. Start: `cd /opt/comatocard && docker compose -f apps/relayer/deploy/compose.yaml up -d --build`. The containers join the Caddy network `deploy_default` as `comatocard-relayer` and `comatocard-assistant`.
4. HTTPS: a Caddy site block `relayer.comatocard.xyz, comatocard-relayer.201.18.211.8.sslip.io { handle /assistant { reverse_proxy comatocard-assistant:4200 } handle { reverse_proxy comatocard-relayer:4100 } }`, then `caddy validate` and `caddy reload` in the Caddy container. The Caddyfile is bind mounted as a single file, so edit it in place (`>>` or an editor that keeps the inode); `sed -i` writes a new file the running container never sees, and `caddy reload` then reports `config is unchanged`.
5. Check: `curl https://relayer.comatocard.xyz/health` shows `{"status":"ok"}`; `docker exec comatocard-relayer-relayer-1 env` lists no `NEAR_AI_API_KEY` and `docker exec comatocard-relayer-assistant-1 env` no `RELAYER_PRIVATE_KEY`.

Update: `git pull && docker compose -f apps/relayer/deploy/compose.yaml up -d --build`. Logs: `docker compose -f apps/relayer/deploy/compose.yaml logs -f relayer assistant`. Top up the relayer account when its balance runs low; each sponsored call costs about 0.0003 NEAR.

## Tests
`pnpm test`: decoding and signature checks on delegates signed with real keys, every refusal, owner and approver authorization, withdraw screening, the HTTP servers (each answers only its own route), the split configuration (neither service reads the other's key), and the policy assistant endpoint with its rate limit. `test/regression/` holds one test per fixed issue.
