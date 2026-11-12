import { actions } from "near-api-js";
import { describe, expect, it } from "vitest";
import { decodeDelegate, hasValidSignature } from "../../src/delegate.js";
import { call, OWNER, signedDelegate, VAULT } from "./support.js";

describe("decodeDelegate", () => {
  it("decodes sender, receiver and function calls with JSON arguments", async () => {
    const delegate = decodeDelegate(await signedDelegate({}));
    expect(delegate.senderId).toBe(OWNER);
    expect(delegate.receiverId).toBe(VAULT);
    expect(delegate.calls).toEqual([
      { methodName: "freeze_card", args: { card_id: 0 }, gas: 30_000_000_000_000n, deposit: 0n },
    ]);
  });

  it("marks actions that are not function calls", async () => {
    const encoded = await signedDelegate({ actions: [actions.transfer(1n)] });
    expect(decodeDelegate(encoded).calls).toEqual([null]);
  });

  it("throws on bytes that are not a SignedDelegate", () => {
    expect(() => decodeDelegate(Buffer.from("hello").toString("base64"))).toThrow();
  });
});

describe("hasValidSignature", () => {
  it("accepts the signer's signature and rejects a tampered action", async () => {
    const encoded = await signedDelegate({});
    expect(hasValidSignature(decodeDelegate(encoded))).toBe(true);
    const tampered = decodeDelegate(encoded);
    const raw = tampered.signed.delegateAction.actions[0] as unknown as {
      functionCall: { methodName: string };
    };
    raw.functionCall.methodName = "withdraw";
    expect(hasValidSignature(tampered)).toBe(false);
  });

  it("rejects a signature over other bytes", async () => {
    const a = decodeDelegate(
      await signedDelegate({ actions: [call("freeze_card", { card_id: 1 })] }),
    );
    const b = decodeDelegate(await signedDelegate({}));
    a.signed.signature = b.signed.signature;
    expect(hasValidSignature(a)).toBe(false);
  });
});
