import { describe, expect, it } from "vitest";
import { relayRequest, relayResponse } from "../src/relayer.js";

describe("relayer schemas", () => {
  it("accepts base64 requests and both response shapes", () => {
    expect(relayRequest.safeParse({ signed_delegate: "AAEC" }).success).toBe(true);
    expect(relayRequest.safeParse({ signed_delegate: "not base64!" }).success).toBe(false);
    expect(relayResponse.parse({ status: "relayed", tx_hash: "abc", failure: null })).toMatchObject(
      { status: "relayed" },
    );
    expect(
      relayResponse.parse({ status: "refused", reason: "not_authorized", detail: "x" }),
    ).toMatchObject({ reason: "not_authorized" });
    expect(
      relayResponse.safeParse({ status: "refused", reason: "nope", detail: "x" }).success,
    ).toBe(false);
  });
});
