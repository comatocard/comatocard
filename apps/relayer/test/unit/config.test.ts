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

  it("keeps the assistant off without a NEAR AI key and never echoes the key", () => {
    expect(loadConfig(env).nearAi).toBeNull();
    expect(loadConfig({ ...env, NEAR_AI_API_KEY: "" }).nearAi).toBeNull();
    expect(loadConfig({ ...env, NEAR_AI_API_KEY: "sk-secret" }).nearAi).toEqual({
      baseUrl: "https://cloud-api.near.ai/v1",
      apiKey: "sk-secret",
      model: "Qwen/Qwen3.8-27B",
    });
    expect(() =>
      loadConfig({ ...env, NEAR_AI_API_KEY: "sk-secret", NEAR_AI_BASE_URL: "not a url" }),
    ).toThrow(/NEAR_AI_BASE_URL/);
    try {
      loadConfig({ ...env, NEAR_AI_API_KEY: "sk-secret", NEAR_AI_BASE_URL: "not a url" });
    } catch (error) {
      expect(String(error)).not.toContain("sk-secret");
    }
  });
});
