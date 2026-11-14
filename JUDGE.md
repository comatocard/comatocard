# Verify Comatocard without a wallet

Every claim below can be checked with `curl` and `jq` against NEAR testnet and the hosted services, with no wallet, no funds and no build. Each step gives the command and the result to expect. The full record of testnet transactions is in [docs/deployments.md](docs/deployments.md); the steps that need a wallet are in the [README](README.md#try-it).

Everything runs on NEAR testnet with tUSD, a test stablecoin: no real money moves.

## Helper
Reads a contract view method. `$3` is the base64 of the JSON arguments (`e30=` is `{}`).

```sh
view() {
  curl -s https://rpc.testnet.near.org -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$3\"}}" \
    | jq -r '.result.result | implode'
}
b64() { printf '%s' "$1" | base64; }
```

Transactions older than a few days are only on the archival node:

```sh
events() {
  curl -s https://archival-rpc.testnet.near.org -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"EXPERIMENTAL_tx_status\",\"params\":{\"tx_hash\":\"$1\",\"sender_account_id\":\"$2\",\"wait_until\":\"NONE\"}}" \
    | jq -c '[.result.receipts_outcome[].outcome.logs[] | select(startswith("EVENT_JSON")) | ltrimstr("EVENT_JSON:") | fromjson | .event]'
}
```

## 1. A vault and a card that paid
```sh
view v5.factory.comatocard.testnet get_config e30=
```
Expect owner `comatocard.testnet`, registry `registry.comatocard.testnet`, `contract_version` `0.4.0`.

```sh
events 7nK8SHcVnQWgDjeng4ozKgUA7ueGMRei5d6FSyZmbVmR v5.factory.comatocard.testnet
```
Expect `["payment_submitted","ft_transfer","payment_settled"]`: the card paid 1 tUSD after the registry check.

## 2. The indexer serves the same history
```sh
curl -s https://indexer.comatocard.xyz/vaults/v5.factory.comatocard.testnet/payments | jq -c '[.items[] | {status, amount, tx_hash}]'
curl -s https://indexer.comatocard.xyz/health
```
Expect the payment above as `settled` with the same `tx_hash`, and a health answer with `lag` close to 0. The GraphQL explorer is at https://indexer.comatocard.xyz/graphql.

## 3. A blocked merchant is refused on chain (track `security`)
```sh
view registry.comatocard.testnet get_status "$(b64 '{"account_id":"comatocard-attacker-7786.testnet"}')"
events 4umkBBcPRMPbzC9ZRWvCPCjNKwpM6bYYbj4yp7vRU24f rio74936.factory.comatocard.testnet
```
Expect `"blocked"`, then `["payment_submitted","payment_failed"]`: a payment an agent signed without its guard (the prompt injection demo, `pnpm attack --no-guard`) failed in the vault with cause `merchant_blocked`, and no tUSD moved.

## 4. An agent pays over HTTP 402 (tracks `agents`, `realworld`)
```sh
curl -s -i https://comatocard.xyz/api/shop/report
```
Expect `HTTP/2 402` and a JSON challenge with `merchant`, `amount`, `reference` and the exact `pay` call a card makes. https://comatocard.xyz/shop shows the same flow in a browser.

## 5. A card is a NEP-171 token (track `nfts`)
```sh
view nft.factory.comatocard.testnet nft_token "$(b64 '{"token_id":"0"}')" | jq '{token_id, owner_id}'
```
Expect owner `comatocard-agent.testnet`: the owner transferred card 0 as a token, which handed it to the agent and deleted the old key. The four transactions are under "Card handover check" in [docs/deployments.md](docs/deployments.md).

## 6. A Sputnik DAO owns a vault and approves its payments (track `social`)
```sh
view dao.factory.comatocard.testnet get_config e30= | jq '{owner, contract_version}'
```
Expect owner `comatocard-council.sputnik-v2.testnet`. The DAO's proposal and vote that approved a queued payment are under "DAO-owned vault" in [docs/deployments.md](docs/deployments.md).

## 7. The policy assistant answers from a TEE, and the answer is verified (track `privacy`)
```sh
curl -s -X POST https://app.comatocard.xyz/api/assistant -H 'content-type: application/json' \
  -d '{"vault":"rio74936.factory.comatocard.testnet","cardId":0,"request":"Lower the daily limit to 40 tUSD"}' \
  | jq '{kind, changed, verified: .verification.verified, model: .verification.model}'
```
Expect `kind` `proposal`, `changed` `["daily_limit"]`, `verified` `true`, model `Qwen/Qwen3.8-27B`. It takes 15 to 30 seconds. The model runs on NEAR AI Cloud; the response signature and the Intel TDX attestation are checked before the answer is returned. It only proposes: nothing changes until the owner signs, so this call is safe to repeat (it is rate limited).

## 8. Idle balance can be lent, and the treasury plans top-ups (track `defi`)
```sh
view v6.factory.comatocard.testnet get_yield e30= | jq -c '{venue, tokens: [.tokens[] | {token, min_liquid}]}'
curl -s "https://app.comatocard.xyz/api/treasury?vault=rio74936.factory.comatocard.testnet" | jq '{action, deficit, out: .quote.amountOutFormatted}'
```
Expect venue `contract.burrow.testnet` (Rhea lending) with `min_liquid` kept for cards, then a `top_up` plan with a NEAR Intents 1Click quote for the deficit. The quote is `dry: true`: nothing is signed, since NEAR Intents has no testnet (Q-007). Supply and recall transactions are under "Vault lending" in [docs/deployments.md](docs/deployments.md).

## 9. The code
- Public, MIT licensed, first commit on 2026-11-09, inside the hackathon window.
- `pnpm install && pnpm build && pnpm test` builds and tests everything; `pnpm test:integration` runs the near-sandbox and Postgres suites. Requirements are in the [README](README.md#from-the-command-line).
- Contracts are reproducible builds attached to [release v0.5.0](https://github.com/comatocard/comatocard/releases/tag/v0.5.0) and [release v0.4.1](https://github.com/comatocard/comatocard/releases/tag/v0.4.1).
