# apps/agents

AI agents that hold card keys: the spending agent, the agent-side guard (preview, risk check, refuse or escalate), the treasury agent (1Click, dry-run by default), the policy assistant (NEAR AI Cloud with attestation) and the prompt-injection attack demo.

Workstream B. Card keys are read from environment variables, never from files in the repository.

## Run locally
1. `cp apps/agents/.env.example apps/agents/.env` and set `VAULT_ID` and `CARD_PRIVATE_KEY` (the `ed25519:` secret of a card issued by that vault).
2. `pnpm turbo run build --filter=@comatocard/agents`, then from `apps/agents`: `pnpm status`.
3. The JSON log shows the vault config and the card bound to the key, with its policy and spend. An unknown key logs `no card is bound to this key` and exits with code 1.

## Tests
`pnpm test`: configuration validation and card lookup, with no network.
