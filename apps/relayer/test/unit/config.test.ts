import { KeyPair } from "near-api-js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

const key = KeyPair.fromRandom("ed25519");
const env = {
  FACTORY_ID: "factory.comatocard.testnet",
  RELAYER_ACCOUNT_ID: "relayer.testnet",
  RELAYER_PRIVATE_KEY: key.toString(),
};

describe("loadConfig", () => {
  it("applies defaults", () => {
    const config = loadConfig(env);
    expect(config).toMatchObject({
      network: "testnet",
      rpcUrl: "https://rpc.testnet.near.org",
      indexerUrl: "http://localhost:4000",
      port: 4100,
    });
    expect(config.relayerKey.getPublicKey().toString()).toBe(key.getPublicKey().toString());
  });

  it("rejects a missing factory or a malformed key without echoing it", () => {
    expect(() => loadConfig({ ...env, FACTORY_ID: undefined })).toThrow(/FACTORY_ID/);
    expect(() => loadConfig({ ...env, RELAYER_PRIVATE_KEY: "ed25519:0OIl-secret" })).toThrow(
      "RELAYER_PRIVATE_KEY is not a valid ed25519 secret key",
    );
  });
});
