# apps/merchant

Demo merchant. Serves a resource behind HTTP 402: the challenge carries a payment reference, the client pays with its card, and the resource unlocks once the indexer reports a matching `payment_settled` event.

Workstream C. See [events](../../docs/specs/events.md).
