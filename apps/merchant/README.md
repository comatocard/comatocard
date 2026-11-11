# apps/merchant

Demo merchant. It serves a resource behind HTTP 402: the challenge carries a payment reference, the client pays with its card, and the resource unlocks once the indexer reports a matching `payment_settled` (`GET /merchants/:merchant/payments?reference=`).

Workstream C. Status: planned. Contracts and indexer endpoints it needs are live on testnet; see [integration guide](../../docs/integration.md).
