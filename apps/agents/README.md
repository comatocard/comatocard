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

## Tests
`pnpm test`: configuration, card lookup, the indexer risk client, the terminal prompt and every branch of the guard, with no network.
