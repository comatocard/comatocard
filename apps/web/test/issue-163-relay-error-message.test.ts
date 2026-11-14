import { describe, expect, it } from "vitest";
import { RELAYER_NOT_SENT, RELAYER_UNREACHABLE, untypedRelayError } from "../src/lib/relay-errors";

// Issue #163: an expired delegate action made the relayer answer 502 "relay failed", and the app
// said the relayer was not reachable although it was up and had sent the transaction.
describe("issue 163: untyped relay answers", () => {
  it("says not reachable only for the proxy's own unreachable answer", () => {
    expect(untypedRelayError({ error: "relayer unreachable" })).toBe(RELAYER_UNREACHABLE);
  });

  it("says the relayer could not send it when the relayer answered", () => {
    expect(untypedRelayError({ error: "relay failed" })).toBe(RELAYER_NOT_SENT);
    expect(untypedRelayError(null)).toBe(RELAYER_NOT_SENT);
    expect(untypedRelayError({ status: "unknown" })).toBe(RELAYER_NOT_SENT);
  });
});
