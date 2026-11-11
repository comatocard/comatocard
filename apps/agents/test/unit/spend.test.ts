import { CARD_PAY_GAS, type PaymentPreview, type RiskAssessment } from "@comatocard/sdk";
import { describe, expect, it, vi } from "vitest";
import type { Approve } from "../../src/approve.js";
import { type Submit, spend } from "../../src/spend.js";

const vaultId = "alice.factory.comatocard.testnet";
const publicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp";
const request = { merchant: "shop.testnet", amount: "5000000", reference: "inv-1" };

const verdict = (v: RiskAssessment["verdict"]): RiskAssessment => ({
  account_id: "shop.testnet",
  verdict: v,
  reasons: v === "allow" ? [] : [{ code: `registry_${v}`, level: v, detail: "curated" }],
  signals: {
    registry_status: v === "allow" ? "clear" : v === "warn" ? "flagged" : "blocked",
    report_count: 1,
    exists: true,
    is_contract: false,
    code_changed_at: null,
    prior_payments: 0,
    first_paid_at: null,
  },
});

function setup(options: {
  preview?: PaymentPreview;
  risk?: RiskAssessment | Error;
  approve?: boolean;
  result?: unknown;
}) {
  const submit = vi.fn<Submit>(async () => ({
    txHash: "tx1",
    result: options.result ?? { status: "submitted", payment_id: 3 },
  }));
  const approve = vi.fn<Approve>(async () => options.approve ?? false);
  const risk = vi.fn(async () => {
    const value = options.risk ?? verdict("allow");
    if (value instanceof Error) throw value;
    return value;
  });
  const logger = { info: vi.fn(), warn: vi.fn() };
  const previewPayment = vi.fn(async () => options.preview ?? { status: "allowed" as const });
  const deps = { client: { vaultId, previewPayment }, publicKey, risk, approve, submit, logger };
  return { deps, submit, approve, risk, logger, previewPayment };
}

describe("spend guard", () => {
  it("refuses what the preview rejects without asking the indexer or signing", async () => {
    const s = setup({ preview: { status: "rejected", reason: "per_tx_limit" } });
    const outcome = await spend(s.deps, request);
    expect(outcome).toMatchObject({ kind: "refused", by: "preview" });
    expect(s.previewPayment).toHaveBeenCalledWith(publicKey, "shop.testnet", "5000000");
    expect(s.risk).not.toHaveBeenCalled();
    expect(s.submit).not.toHaveBeenCalled();
    expect(s.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "refused", refusedBy: "preview" }),
      "guard decision",
    );
  });

  it("refuses a blocked merchant without asking a human", async () => {
    const s = setup({ risk: verdict("block") });
    expect(await spend(s.deps, request)).toMatchObject({ kind: "refused", by: "risk" });
    expect(s.approve).not.toHaveBeenCalled();
    expect(s.submit).not.toHaveBeenCalled();
    expect(s.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ verdict: "block", reasons: ["block:registry_block"] }),
      "guard decision",
    );
  });

  it("fails closed when the indexer is unreachable", async () => {
    const s = setup({ risk: new Error("indexer responded 503") });
    expect(await spend(s.deps, request)).toMatchObject({
      kind: "refused",
      by: "risk_unavailable",
      error: "indexer responded 503",
    });
    expect(s.submit).not.toHaveBeenCalled();
  });

  it("asks a human on warn and refuses when declined", async () => {
    const s = setup({ risk: verdict("warn"), approve: false });
    expect(await spend(s.deps, request)).toMatchObject({ kind: "refused", by: "human" });
    expect(s.approve).toHaveBeenCalledWith(request, verdict("warn"));
    expect(s.submit).not.toHaveBeenCalled();
  });

  it("signs on warn when a human approves", async () => {
    const s = setup({ risk: verdict("warn"), approve: true });
    expect(await spend(s.deps, request)).toMatchObject({ kind: "sent", approvedByHuman: true });
    expect(s.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "sign", approvedByHuman: true, verdict: "warn" }),
      "guard decision",
    );
  });

  it("signs pay on the vault with card gas on allow", async () => {
    const s = setup({});
    expect(await spend(s.deps, request)).toEqual({
      kind: "sent",
      preview: { status: "allowed" },
      risk: verdict("allow"),
      approvedByHuman: false,
      decision: { status: "submitted", payment_id: 3 },
      txHash: "tx1",
    });
    expect(s.approve).not.toHaveBeenCalled();
    expect(s.submit).toHaveBeenCalledWith({
      receiverId: vaultId,
      methodName: "pay",
      args: { merchant: "shop.testnet", amount: "5000000", memo: null, reference: "inv-1" },
      gas: CARD_PAY_GAS,
      deposit: "0",
    });
  });

  it("sends a payment that needs approval so the vault queues it", async () => {
    const s = setup({
      preview: { status: "needs_approval", cause: "threshold" },
      result: { status: "queued", payment_id: 4, cause: "threshold" },
    });
    const outcome = await spend(s.deps, { merchant: "shop.testnet", amount: "15000000" });
    expect(outcome.kind === "sent" && outcome.decision.status).toBe("queued");
  });

  it("rejects a result that is not a payment decision", async () => {
    const s = setup({ result: { status: "done" } });
    await expect(spend(s.deps, request)).rejects.toThrow(/pay tx1: unexpected result/);
  });
});
