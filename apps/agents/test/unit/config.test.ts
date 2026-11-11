import { KeyPair } from "near-api-js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

const key = KeyPair.fromRandom("ed25519");
const env = { VAULT_ID: "demo.factory.comatocard.testnet", CARD_PRIVATE_KEY: key.toString() };

describe("loadConfig", () => {
  it("applies testnet defaults and derives the card public key", () => {
    const config = loadConfig(env);
    expect(config.network).toBe("testnet");
    expect(config.rpcUrl).toBe("https://rpc.testnet.near.org");
    expect(config.logLevel).toBe("info");
    expect(config.indexerUrl).toBe("http://localhost:4000");
    expect(config.cardKey.getPublicKey().toString()).toBe(key.getPublicKey().toString());
  });

  it("uses the mainnet RPC and treats an empty override as unset", () => {
    expect(loadConfig({ ...env, NETWORK: "mainnet", RPC_URL: "" }).rpcUrl).toBe(
      "https://rpc.mainnet.near.org",
    );
    expect(loadConfig({ ...env, RPC_URL: "https://rpc.example" }).rpcUrl).toBe(
      "https://rpc.example",
    );
  });

  it("rejects a missing vault or a malformed key without echoing the secret", () => {
    expect(() => loadConfig({ CARD_PRIVATE_KEY: env.CARD_PRIVATE_KEY })).toThrow(/VAULT_ID/);
    expect(() => loadConfig({ ...env, CARD_PRIVATE_KEY: "secret-value" })).toThrow(
      /CARD_PRIVATE_KEY/,
    );
    const broken = "ed25519:not-base58-0OIl";
    expect(() => loadConfig({ ...env, CARD_PRIVATE_KEY: broken })).toThrow(
      "CARD_PRIVATE_KEY is not a valid ed25519 secret key",
    );
  });
});
