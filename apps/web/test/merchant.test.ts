import type { PaymentRow } from "@comatocard/sdk";
import { describe, expect, it } from "vitest";
import {
  challenge,
  isReference,
  MERCHANT_ID,
  newReference,
  PRICE,
  settledPayment,
} from "../src/lib/merchant";

const token = "tusd.comatocard.testnet";
const row = (over: Partial<PaymentRow>): PaymentRow => ({
  id: 1,
  payment_id: 1,
  vault_id: "acme.factory.comatocard.testnet",
  card_id: 0,
  merchant: MERCHANT_ID,
  token,
  amount: PRICE,
  memo: null,
  reference: "shop-0123456789abcdef0123",
  status: "settled",
  queue_cause: null,
  reason: null,
  approver_id: null,
  tx_hash: "tx",
  created_at: "0",
  updated_at: "0",
  ...over,
});

describe("402 merchant", () => {
  it("issues references the vault accepts and only recognises its own", () => {
    const reference = newReference();
    expect(isReference(reference)).toBe(true);
    expect(new TextEncoder().encode(reference).length).toBeLessThanOrEqual(64);
    expect(isReference("inv-1")).toBe(false);
    expect(challenge(token, reference).pay.args).toEqual({
      merchant: MERCHANT_ID,
      amount: PRICE,
      reference,
    });
  });

  it("unlocks only for a settled payment of at least the price, to us, in the token", () => {
    const ref = "shop-0123456789abcdef0123";
    expect(settledPayment([row({})], ref, token)).not.toBeNull();
    expect(settledPayment([row({ status: "queued" })], ref, token)).toBeNull();
    expect(settledPayment([row({ amount: "999999" })], ref, token)).toBeNull();
    expect(settledPayment([row({ merchant: "other.testnet" })], ref, token)).toBeNull();
    expect(settledPayment([row({ token: "fake.testnet" })], ref, token)).toBeNull();
    expect(
      settledPayment([row({ reference: "shop-ffffffffffffffffffff" })], ref, token),
    ).toBeNull();
  });
});
