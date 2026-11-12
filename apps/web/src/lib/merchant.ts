import type { PaymentRow } from "@comatocard/sdk";

/** The demo merchant: who is paid, what the resource costs (1 tUSD), in which token. */
export const MERCHANT_ID = process.env.NEXT_PUBLIC_MERCHANT_ID || "comatocard-shop.testnet";
export const PRICE = "1000000";

/** What a client gets with HTTP 402: pay this, with this reference, then ask again. */
export interface Challenge {
  merchant: string;
  token: string;
  amount: string;
  reference: string;
  /** The vault call that settles it, for a card holder. */
  pay: { method: "pay"; args: { merchant: string; amount: string; reference: string } };
}

export const challenge = (token: string, reference: string): Challenge => ({
  merchant: MERCHANT_ID,
  token,
  amount: PRICE,
  reference,
  pay: { method: "pay", args: { merchant: MERCHANT_ID, amount: PRICE, reference } },
});

/** A fresh reference, at most 64 bytes as the vault requires. */
export const newReference = () => `shop-${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;

/** References look like ours; anything else is refused before asking the indexer. */
export const isReference = (value: string) => /^shop-[a-f\d]{20}$/.test(value);

/** The settled payment that pays for this reference, at least the price, in the right token. */
export function settledPayment(
  rows: PaymentRow[],
  reference: string,
  token: string,
): PaymentRow | null {
  return (
    rows.find(
      (r) =>
        r.status === "settled" &&
        r.reference === reference &&
        r.merchant === MERCHANT_ID &&
        r.token === token &&
        BigInt(r.amount) >= BigInt(PRICE),
    ) ?? null
  );
}
