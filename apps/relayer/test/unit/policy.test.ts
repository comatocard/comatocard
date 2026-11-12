import { actions } from "near-api-js";
import { describe, expect, it } from "vitest";
import { decodeDelegate } from "../../src/delegate.js";
import { checkDelegate } from "../../src/policy.js";
import { call, FACTORY, signedDelegate } from "./support.js";

const check = async (options: Parameters<typeof signedDelegate>[0]) =>
  checkDelegate(decodeDelegate(await signedDelegate(options)), FACTORY);

describe("checkDelegate", () => {
  it("accepts an allowlisted owner call on a factory vault", async () => {
    expect(await check({})).toEqual({ ok: true });
  });

  it.each([
    "factory.comatocard.testnet",
    "alice.other-factory.testnet",
    "a.b.factory.comatocard.testnet",
    "evilfactory.comatocard.testnet",
  ])("refuses receiver %s", async (receiver) => {
    expect(await check({ receiver })).toMatchObject({ ok: false, reason: "not_a_vault" });
  });

  it("never relays card payments or ownership transfer", async () => {
    for (const method of ["pay", "propose_owner", "accept_owner", "nft_transfer"]) {
      expect(await check({ actions: [call(method)] })).toMatchObject({
        ok: false,
        reason: "method_not_allowed",
      });
    }
  });

  it("refuses deposits, non function-call actions and empty delegates", async () => {
    expect(await check({ actions: [call("freeze_card", {}, 1n)] })).toMatchObject({
      reason: "deposit_not_zero",
    });
    expect(await check({ actions: [call("freeze_card"), actions.transfer(1n)] })).toMatchObject({
      reason: "action_not_allowed",
    });
    expect(await check({ actions: [] })).toMatchObject({ reason: "action_not_allowed" });
  });

  it("refuses a delegate whose signature does not match", async () => {
    const delegate = decodeDelegate(await signedDelegate({}));
    const other = decodeDelegate(await signedDelegate({ actions: [call("revoke_card")] }));
    delegate.signed.signature = other.signed.signature;
    expect(checkDelegate(delegate, FACTORY)).toMatchObject({ ok: false, reason: "bad_signature" });
  });
});
