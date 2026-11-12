# apps/agents

AI agents that hold card keys: the spending agent, the agent-side guard (preview, risk check, refuse or escalate), the treasury agent (1Click, dry-run by default), the policy assistant (NEAR AI Cloud with attestation) and the prompt-injection attack demo.

Workstream B. Card keys are read from environment variables, never from files in the repository.

## Run locally
1. `cp apps/agents/.env.example apps/agents/.env` and set `VAULT_ID` and `CARD_PRIVATE_KEY` (the `ed25519:` secret of a card issued by that vault).
2. `pnpm turbo run build --filter=@comatocard/agents`, then from `apps/agents`: `pnpm status`.
3. The JSON log shows the vault config and the card bound to the key, with its policy and spend. An unknown key logs `no card is bound to this key` and exits with code 1.
4. `pnpm pay <merchant> <amount> [reference]` pays from the card, amount in the token's smallest unit (`5000000` is 5 tUSD). The agent-side guard runs first and logs one `guard decision` line:
   - `preview_payment` rejects: refused, nothing is signed.
   - The indexer at `INDEXER_URL` answers `GET /risk/<merchant>?vault=<vault>` with `block`: refused. With `warn`: a human confirms on the terminal; without a terminal, or on Ctrl+C or Ctrl+D, it is refused. Unreachable indexer or invalid answer: refused.
   - Otherwise the agent signs `pay` with the card key and logs the decision (`submitted` or `queued`) and the transaction hash. Refusals exit with code 1.

## Treasury agent
Keeps enough stablecoin in the vault for what its cards may still spend. Each active card needs what it may still spend today, capped by what is left of its period limit, with the vault's own day and period windows. When the vault's available balance is below the total, the agent asks NEAR Intents 1Click for an `EXACT_OUTPUT` quote of the deficit with a slippage limit and refuses a plan above a USD cap.

A run is a dry run unless `--execute` is given: it prints the plan and never signs or sends. NEAR Intents has no testnet (Q-007), so the testnet token is quoted as mainnet USDC.

1. Set `VAULT_ID` and `TREASURY_ACCOUNT` (an existing mainnet account that would receive the swap; 1Click answers 500 for an account that does not exist).
2. `pnpm treasury` logs `treasury plan: none` when the vault covers every card, `treasury plan: top_up` with the deficit and the 1Click quote, or `treasury plan: refused` with the reason (exit code 1).
3. Optional: `TREASURY_SLIPPAGE_BPS` (default 100), `TREASURY_MAX_SWAP_USD` (default 20), `TREASURY_ORIGIN_ASSET` (default `nep141:wrap.near`), `ONECLICK_JWT` for the partner fee schedule.

### Execute a top-up on mainnet
`pnpm treasury --execute` swaps for real when the plan is `top_up`. It needs `TREASURY_PRIVATE_KEY`, the full access key of `TREASURY_ACCOUNT` on mainnet, and that account must hold the NEAR to swap. Use a separate account funded with only what the cap allows.

1. Commits a fresh `EXACT_OUTPUT` quote (`dry: false`) and applies the same checks as the plan; a refused quote sends nothing.
2. Sends one transaction to `wrap.near`: `storage_deposit` for the treasury account and the 1Click deposit address (a fresh implicit account that wrap.near does not know yet; refunded when already registered), `near_deposit` of the quoted input and `ft_transfer` to the deposit address.
3. Calls `POST /deposit/submit` and polls `GET /status` every 3 seconds for up to 10 minutes.
4. Logs `treasury swap: SUCCESS` with the deposit and delivery transaction hashes. `REFUNDED`, `INCOMPLETE_DEPOSIT`, `FAILED` or `TIMEOUT` exit with code 1; a refund returns to `TREASURY_ACCOUNT`.

The swapped USDC lands in `TREASURY_ACCOUNT`. The testnet vault cannot receive mainnet tokens; on a mainnet vault the owner deposits it with `ft_transfer_call`.

## Policy assistant
An owner describes a policy change in plain language; a model running in a TEE on NEAR AI Cloud proposes the full new policy; the agent proves the answer came from that TEE and prints the `update_policy` call for the owner to sign. It never signs.

1. Set `VAULT_ID` and `NEAR_AI_API_KEY`; `POLICY_MODEL` defaults to `Qwen/Qwen3.8-27B`.
2. `pnpm policy 0 "Lower the daily limit to 40 tUSD and only allow paying comatocard-shop.testnet"` logs `proposal verified in TEE, changes: daily_limit, merchants` with the current and proposed policy and the verification, then prints a `pnpm --filter @comatocard/relayer owner-call ... update_policy '...'` command.
3. Running that command signs as the owner, gasless through the relayer; the vault emits `card_policy_updated`.

A proposal is offered for signing only when every check passes:

| Check | How |
|-|-|
| Response signed by the TEE | `GET /v1/signature/<id>` (ed25519) signs `model:sha256(request):sha256(response)` of the exact bytes sent and received |
| Signing key attested | `GET /v1/attestation/report` with a fresh nonce returns the signing instance; its Intel TDX quote is signed by the attestation key, the QE report by the PCK certificate, the QE report binds the attestation key, and the PCK chain ends at the pinned Intel SGX Root CA (`src/intel-root.ts`) |
| Key and nonce bound | The quote's report data is the signing key followed by our nonce |
| App measured | MRCONFIGID is `01`, sha256 of the published app compose, then zero bytes |
| Policy valid | SDK `policy` schema, same token, `per_tx_limit <= daily_limit <= monthly_limit` |

Not checked: TCB level and revocation (Intel collateral), NVIDIA GPU evidence, and an allowlist of measurements; the compose hash is printed so a reviewer can compare it with the published compose.

## Tests
`pnpm test`: configuration, card lookup, the indexer risk client, the terminal prompt, every branch of the guard, card buffers, treasury plans, the treasury execution (deposit transaction, polling, refunds, timeout), the 1Click client, TDX quote and response signature checks on recorded NEAR AI traffic (`test/fixtures/near-ai-qwen.json`) and the policy assistant, with no network.
