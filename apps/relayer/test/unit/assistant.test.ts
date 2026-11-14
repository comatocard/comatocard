import { describe, expect, it, vi } from "vitest";
import { assistant } from "../../src/assistant.js";
import { assistantDeps, card, proposal, VAULT } from "./assistant-support.js";

const ask = { vault: VAULT, cardId: 0, request: "raise the daily limit to 80 tUSD" };

describe("assistant", () => {
  it("answers 503 without a NEAR AI key", async () => {
    expect(await assistant(null, ask, "c")).toEqual({
      status: 503,
      body: { error: "The assistant is not configured." },
    });
  });

  it("answers 429 before reading the body once the client is over its limit", async () => {
    const deps = assistantDeps({ allow: () => false });
    expect((await assistant(deps, ask, "c")).status).toBe(429);
    expect(deps.card).not.toHaveBeenCalled();
  });

  it("refuses a malformed body", async () => {
    const deps = assistantDeps();
    for (const body of [null, {}, { ...ask, request: "x" }, { ...ask, extra: 1 }]) {
      expect((await assistant(deps, body, "c")).status).toBe(400);
    }
    expect(deps.propose).not.toHaveBeenCalled();
  });

  it("answers 404 for a vault outside the factory without calling the model", async () => {
    const deps = assistantDeps();
    for (const vault of ["alice.testnet", "a.b.factory.comatocard.testnet"]) {
      expect((await assistant(deps, { ...ask, vault }, "c")).status).toBe(404);
    }
    expect(deps.card).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing card or a failed read", async () => {
    const missing = assistantDeps({ card: async () => null });
    expect((await assistant(missing, ask, "c")).status).toBe(404);
    const failing = assistantDeps({ card: async () => Promise.reject(new Error("rpc down")) });
    expect((await assistant(failing, ask, "c")).status).toBe(404);
    expect(failing.propose).not.toHaveBeenCalled();
  });

  it("returns the proposal for the card and the trimmed request", async () => {
    const deps = assistantDeps();
    expect(await assistant(deps, { ...ask, request: `  ${ask.request} ` }, "c")).toEqual({
      status: 200,
      body: proposal,
    });
    expect(deps.propose).toHaveBeenCalledWith(VAULT, card, ask.request);
  });

  it("answers 502 and logs when the model fails, without the request text", async () => {
    const warn = vi.fn();
    const deps = assistantDeps({
      propose: async () => Promise.reject(new Error("attestation mismatch")),
      logger: { warn },
    });
    expect(await assistant(deps, ask, "c")).toEqual({
      status: 502,
      body: { error: "NEAR AI Cloud did not answer. Try again." },
    });
    expect(warn).toHaveBeenCalledWith(
      { vault: VAULT, cardId: 0, error: "attestation mismatch" },
      "assistant failed",
    );
  });
});
