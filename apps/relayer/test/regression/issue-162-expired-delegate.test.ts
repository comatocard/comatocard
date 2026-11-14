import {
  DelegateActionExpiredActionError,
  DelegateActionInvalidNonceActionError,
} from "near-api-js/rpc-errors";
import { describe, expect, it, vi } from "vitest";
import { type RelayDeps, relay } from "../../src/relay.js";
import { FACTORY, OWNER, signedDelegate } from "../unit/support.js";

// #162: an expired delegate made the relayer answer 502 "relay failed". The support helper signs
// delegates valid up to block 1000.

function deps(overrides: Partial<RelayDeps> = {}) {
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
    finalHeight: async () => 500n,
    send: vi.fn(async () => ({ txHash: "tx1", failure: null })),
    ...overrides,
  };
}

const body = async () => ({ signed_delegate: await signedDelegate({}) });

describe("issue 162: expired delegates", () => {
  it("refuses a delegate already past its max block height without sending it", async () => {
    const d = deps({ finalHeight: async () => 1_000n });
    expect(await relay(d, await body())).toEqual({
      status: "refused",
      reason: "expired",
      detail: "The signed action expired before it was sent. Sign it again.",
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("answers expired when the chain rejects the delegate on the way", async () => {
    const d = deps({
      send: vi.fn(async () => {
        throw new DelegateActionExpiredActionError(0, "tx", "block");
      }),
    });
    expect(await relay(d, await body())).toMatchObject({ status: "refused", reason: "expired" });
  });

  it("answers nonce_used when the delegate nonce was already spent", async () => {
    const d = deps({
      send: vi.fn(async () => {
        throw new DelegateActionInvalidNonceActionError(9, 7, 0, "tx", "block");
      }),
    });
    expect(await relay(d, await body())).toMatchObject({ status: "refused", reason: "nonce_used" });
  });

  it("still surfaces other send errors", async () => {
    const d = deps({
      send: vi.fn(async () => {
        throw new Error("rpc down");
      }),
    });
    await expect(relay(d, await body())).rejects.toThrow("rpc down");
  });
});
