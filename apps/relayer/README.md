# apps/relayer

Meta transaction relayer for owner actions. It sponsors only delegate actions whose receiver is a vault created by the factory, with an allowlist of owner methods and no attached deposit. Card payments never go through the relayer, and it holds no vault keys.

Workstream B. Status: planned. Rules it must follow: [integration guide](../../docs/integration.md) and [compliance](../../docs/compliance.md).
