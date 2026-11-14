import { KeyPair } from "near-api-js";
import { describe, expect, it } from "vitest";
import { loadAssistantConfig, loadConfig } from "../../src/config.js";

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

  it("never reads the NEAR AI key into the relayer", () => {
    expect(JSON.stringify(loadConfig({ ...env, NEAR_AI_API_KEY: "sk-secret" }))).not.toContain(
      "sk-secret",
    );
  });
});

describe("loadAssistantConfig", () => {
  const assistantEnv = { FACTORY_ID: "factory.comatocard.testnet", NEAR_AI_API_KEY: "sk-secret" };

  it("needs the NEAR AI key, applies defaults and never reads the relayer key", () => {
    const config = loadAssistantConfig({ ...assistantEnv, RELAYER_PRIVATE_KEY: key.toString() });
    expect(config).toEqual({
      rpcUrl: "https://rpc.testnet.near.org",
      factoryId: "factory.comatocard.testnet",
      port: 4200,
      logLevel: "info",
      nearAi: {
        baseUrl: "https://cloud-api.near.ai/v1",
        apiKey: "sk-secret",
        model: "Qwen/Qwen3.8-27B",
      },
    });
    expect(() => loadAssistantConfig({ ...assistantEnv, NEAR_AI_API_KEY: undefined })).toThrow(
      /NEAR_AI_API_KEY/,
    );
  });

  it("rejects a bad base URL without echoing the key", () => {
    try {
      loadAssistantConfig({ ...assistantEnv, NEAR_AI_BASE_URL: "not a url" });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toMatch(/NEAR_AI_BASE_URL/);
      expect(String(error)).not.toContain("sk-secret");
    }
  });
});
