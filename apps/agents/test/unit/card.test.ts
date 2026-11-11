import type { VaultClient } from "@comatocard/sdk";
import { describe, expect, it, vi } from "vitest";
import { readCardStatus } from "../../src/card.js";

describe("readCardStatus", () => {
  it("reads the vault config and looks the card up by public key", async () => {
    const getCardByKey = vi.fn(async () => null);
    const client = { getConfig: async () => ({ owner: "alice.testnet" }), getCardByKey };
    const status = await readCardStatus(client as unknown as VaultClient, "ed25519:abc");
    expect(status).toEqual({ vault: { owner: "alice.testnet" }, card: null });
    expect(getCardByKey).toHaveBeenCalledWith("ed25519:abc");
  });
});
