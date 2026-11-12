import type { PaymentRow, PaymentRowStatus } from "@comatocard/sdk";

/** Title of a payment row, worded for an owner who has used a company card, not a blockchain. */
export const STATUS_TITLE: Record<PaymentRowStatus, string> = {
  submitted: "Paying",
  queued: "Waiting for approval",
  approved: "Approved",
  settled: "Paid",
  failed: "Failed",
  declined: "Declined",
  expired: "Expired",
  rejected: "Refused",
};

/** Plain words for every reject reason, failure cause and queue cause the contract emits. */
const REASON: Record<string, string> = {
  card_frozen: "the card is frozen",
  card_revoked: "the card was revoked",
  card_not_yet_valid: "the card is not valid yet",
  card_expired: "the card has expired",
  token_not_accepted: "the vault does not accept this token",
  amount_zero: "the amount was zero",
  merchant_not_allowed: "this merchant is not allowed on the card",
  per_tx_limit: "above the per payment limit",
  daily_limit: "above today's limit",
  monthly_limit: "above the 30 day limit",
  insufficient_balance: "the vault balance is too low",
  queue_full: "ten payments are already waiting",
  transfer_failed: "the token transfer failed",
  merchant_blocked: "the merchant is blocked in the registry",
  registry_unavailable: "the registry could not be checked",
  threshold: "above the approval threshold",
  risk_flagged: "the merchant is flagged in the registry",
};

export const reasonText = (code: string): string => REASON[code] ?? code.replaceAll("_", " ");

/** The one line under a payment's title: why it was refused, failed or waits. */
export function paymentDetail(row: PaymentRow): string | null {
  if (row.reason) return reasonText(row.reason);
  if (row.status === "queued" && row.queue_cause) return reasonText(row.queue_cause);
  if (row.approver_id && (row.status === "settled" || row.status === "approved")) {
    return `approved by ${row.approver_id}`;
  }
  return null;
}

export type PaymentTone = "ok" | "wait" | "bad" | "neutral";

export const STATUS_TONE: Record<PaymentRowStatus, PaymentTone> = {
  submitted: "neutral",
  queued: "wait",
  approved: "neutral",
  settled: "ok",
  failed: "bad",
  declined: "bad",
  expired: "neutral",
  rejected: "bad",
};

/** Nanosecond timestamp string to milliseconds. */
export const nsToMs = (ns: string): number => Number(BigInt(ns) / 1_000_000n);
