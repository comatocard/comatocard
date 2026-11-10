import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

const base = { FACTORY_ID: "factory.comatocard.testnet", DATABASE_URL: "postgres://localhost/x" };

describe("loadConfig", () => {
  it("applies network defaults", () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({
      network: "testnet",
      neardataUrl: "https://testnet.neardata.xyz",
      rpcUrl: "https://rpc.testnet.near.org",
      port: 4000,
      registryId: undefined,
      startBlock: undefined,
    });
  });

  it("treats empty values as unset and honours overrides", () => {
    const config = loadConfig({
      ...base,
      NETWORK: "mainnet",
      REGISTRY_ID: "",
      START_BLOCK: "123",
      NEARDATA_URL: "https://neardata.example",
      PORT: "8080",
    });
    expect(config).toMatchObject({
      network: "mainnet",
      registryId: undefined,
      startBlock: 123,
      neardataUrl: "https://neardata.example",
      rpcUrl: "https://rpc.mainnet.near.org",
      port: 8080,
    });
  });

  it("rejects invalid configuration with a readable message", () => {
    expect(() => loadConfig({ DATABASE_URL: "x" })).toThrow(/FACTORY_ID/);
    expect(() => loadConfig({ ...base, FACTORY_ID: "Not Valid" })).toThrow(/invalid NEAR account/);
  });
});
