import { describe, expect, it, vi } from "vitest";
import { type RelayDeps, relay } from "../../src/relay.js";
import { call, FACTORY, OWNER, signedDelegate } from "./support.js";

function deps(): RelayDeps & { send: ReturnType<typeof vi.fn> } {
  return {
    factoryId: FACTORY,
    logger: { info: vi.fn(), warn: vi.fn() },
    vault: async () => ({
      config: {
        owner: OWNER,
        pending_owner: null,
        factory: FACTORY,
        registry: null,
        approval_ttl: "1",
        contract_version: "0.4.0",
      },
      approvers: [],
    }),
    risk: async () => {
      throw new Error("not used");
    },
    send: vi.fn(async () => ({ txHash: "tx1", failure: null })),
  };
}

describe("relay", () => {
  it("sponsors a valid owner call", async () => {
    const d = deps();
    const result = await relay(d, { signed_delegate: await signedDelegate({}) });
    expect(result).toEqual({ status: "relayed", tx_hash: "tx1", failure: null });
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ sender: OWNER, methods: ["freeze_card"], txHash: "tx1" }),
      "relayed",
    );
  });

  it("refuses malformed bodies and payloads without sending", async () => {
    const d = deps();
    expect(await relay(d, { delegate: "x" })).toMatchObject({ reason: "malformed" });
    expect(
      await relay(d, { signed_delegate: Buffer.from("nope").toString("base64") }),
    ).toMatchObject({
      reason: "malformed",
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("refuses before reading the chain when a static check fails", async () => {
    const d = deps();
    const vault = vi.spyOn(d, "vault");
    const result = await relay(d, {
      signed_delegate: await signedDelegate({ actions: [call("pay")] }),
    });
    expect(result).toMatchObject({ status: "refused", reason: "method_not_allowed" });
    expect(vault).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("refuses a sender that is not the owner", async () => {
    const d = deps();
    const result = await relay(d, {
      signed_delegate: await signedDelegate({ sender: "mallory.testnet" }),
    });
    expect(result).toMatchObject({ status: "refused", reason: "not_authorized" });
    expect(d.send).not.toHaveBeenCalled();
  });
});
