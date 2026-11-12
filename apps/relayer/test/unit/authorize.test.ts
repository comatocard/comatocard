import type { RiskAssessment } from "@comatocard/sdk";
import { describe, expect, it, vi } from "vitest";
import { type AuthorizeDeps, authorize } from "../../src/authorize.js";
import { decodeDelegate } from "../../src/delegate.js";
import { call, OWNER, signedDelegate } from "./support.js";

const verdict = (v: RiskAssessment["verdict"]): RiskAssessment => ({
  account_id: "bob.testnet",
  verdict: v,
  reasons: v === "block" ? [{ code: "registry_blocked", level: "block", detail: "curated" }] : [],
  signals: {
    registry_status: v === "block" ? "blocked" : "clear",
    report_count: 0,
    exists: true,
    is_contract: false,
    code_changed_at: null,
    prior_payments: 0,
    first_paid_at: null,
  },
});

function deps(risk: () => Promise<RiskAssessment> = async () => verdict("allow")) {
  const config = {
    owner: OWNER,
    pending_owner: null,
    factory: "factory.comatocard.testnet",
    registry: null,
    approval_ttl: "86400000000000",
    contract_version: "0.4.0",
  };
  return {
    vault: vi.fn<AuthorizeDeps["vault"]>(async () => ({ config, approvers: ["carol.testnet"] })),
    risk: vi.fn(risk),
  };
}

const run = async (d: AuthorizeDeps, options: Parameters<typeof signedDelegate>[0]) =>
  authorize(d, decodeDelegate(await signedDelegate(options)));

const withdraw = (receiver_id?: string) =>
  call("withdraw", { token: "tusd.testnet", amount: "1", ...(receiver_id ? { receiver_id } : {}) });

describe("authorize", () => {
  it("lets the owner call any relayed method", async () => {
    expect(await run(deps(), {})).toEqual({ ok: true });
  });

  it("refuses a sender that is not the owner", async () => {
    expect(await run(deps(), { sender: "mallory.testnet" })).toMatchObject({
      ok: false,
      reason: "not_authorized",
    });
  });

  it("lets an approver approve and decline, nothing else", async () => {
    const d = deps();
    expect(await run(d, { sender: "carol.testnet", actions: [call("approve_payment")] })).toEqual({
      ok: true,
    });
    expect(
      await run(d, {
        sender: "carol.testnet",
        actions: [call("decline_payment"), call("freeze_card")],
      }),
    ).toMatchObject({ ok: false, reason: "not_authorized" });
  });

  it("screens withdraw receivers and refuses blocked ones", async () => {
    const allowed = deps();
    expect(await run(allowed, { actions: [withdraw("bob.testnet")] })).toEqual({ ok: true });
    expect(allowed.risk).toHaveBeenCalledWith("bob.testnet", "alice.factory.comatocard.testnet");
    const blocked = deps(async () => verdict("block"));
    expect(await run(blocked, { actions: [withdraw("bob.testnet")] })).toEqual({
      ok: false,
      reason: "receiver_blocked",
      detail: "bob.testnet: registry_blocked",
    });
  });

  it("fails closed when the indexer cannot answer or the receiver is missing", async () => {
    const down = deps(async () => {
      throw new Error("indexer responded 503");
    });
    expect(await run(down, { actions: [withdraw("bob.testnet")] })).toMatchObject({
      reason: "risk_unavailable",
      detail: "indexer responded 503",
    });
    expect(await run(deps(), { actions: [withdraw()] })).toMatchObject({ reason: "malformed" });
  });
});
