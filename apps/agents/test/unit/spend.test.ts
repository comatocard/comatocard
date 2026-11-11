import { CARD_PAY_GAS, type PaymentPreview } from "@comatocard/sdk";
import { describe, expect, it, vi } from "vitest";
import { type Submit, spend } from "../../src/spend.js";

const vaultId = "alice.factory.comatocard.testnet";
const publicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp";
const request = { merchant: "shop.testnet", amount: "5000000", reference: "inv-1" };

function deps(preview: PaymentPreview, result: unknown = { status: "submitted", payment_id: 3 }) {
  const previewPayment = vi.fn(async () => preview);
  const submit = vi.fn<Submit>(async () => ({ txHash: "tx1", result }));
  return {
    previewPayment,
    submit,
    deps: { client: { vaultId, previewPayment }, publicKey, submit },
  };
}

describe("spend", () => {
  it("does not sign a payment the preview rejects", async () => {
    const {
      deps: d,
      submit,
      previewPayment,
    } = deps({ status: "rejected", reason: "per_tx_limit" });
    const outcome = await spend(d, request);
    expect(outcome).toEqual({
      kind: "refused",
      preview: { status: "rejected", reason: "per_tx_limit" },
    });
    expect(previewPayment).toHaveBeenCalledWith(publicKey, "shop.testnet", "5000000");
    expect(submit).not.toHaveBeenCalled();
  });

  it("signs pay on the vault with card gas and returns the decision", async () => {
    const { deps: d, submit } = deps({ status: "allowed" });
    const outcome = await spend(d, request);
    expect(outcome).toEqual({
      kind: "sent",
      preview: { status: "allowed" },
      decision: { status: "submitted", payment_id: 3 },
      txHash: "tx1",
    });
    expect(submit).toHaveBeenCalledWith({
      receiverId: vaultId,
      methodName: "pay",
      args: { merchant: "shop.testnet", amount: "5000000", memo: null, reference: "inv-1" },
      gas: CARD_PAY_GAS,
      deposit: "0",
    });
  });

  it("sends a payment that needs approval so the vault queues it", async () => {
    const { deps: d } = deps(
      { status: "needs_approval", cause: "threshold" },
      { status: "queued", payment_id: 4, cause: "threshold" },
    );
    const outcome = await spend(d, { merchant: "shop.testnet", amount: "15000000" });
    expect(outcome.kind === "sent" && outcome.decision.status).toBe("queued");
  });

  it("rejects a result that is not a payment decision", async () => {
    const { deps: d } = deps({ status: "allowed" }, { status: "done" });
    await expect(spend(d, request)).rejects.toThrow(/pay tx1: unexpected result/);
  });
});
