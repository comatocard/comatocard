import { z } from "zod";
import { accountId, id, publicKey, u64, u128 } from "./primitives.js";

export const cardKind = z.enum(["human", "agent", "treasury"]);
export const cardStatus = z.enum(["active", "frozen", "revoked"]);
export const riskMode = z.enum(["off", "block_only", "strict"]);
export const registryStatus = z.enum(["clear", "flagged", "blocked"]);
export const queueCause = z.enum(["threshold", "risk_flagged"]);
export const failureCause = z.enum(["transfer_failed", "merchant_blocked", "registry_unavailable"]);
export const paymentStatus = z.enum(["queued", "checking", "transferring"]);
export const rejectReason = z.enum([
  "card_frozen",
  "card_revoked",
  "card_not_yet_valid",
  "card_expired",
  "token_not_accepted",
  "amount_zero",
  "merchant_not_allowed",
  "per_tx_limit",
  "daily_limit",
  "monthly_limit",
  "insufficient_balance",
]);

export const merchantRule = z.union([
  z.literal("any"),
  z.strictObject({ allow: z.array(accountId) }),
  z.strictObject({ deny: z.array(accountId) }),
]);

export const policy = z.strictObject({
  token: accountId,
  per_tx_limit: u128,
  daily_limit: u128,
  monthly_limit: u128,
  approval_threshold: u128.nullable(),
  merchants: merchantRule,
  valid_from: u64.nullable(),
  expires_at: u64.nullable(),
  risk_mode: riskMode,
});

export const spend = z.strictObject({
  day: id,
  day_spent: u128,
  period: id,
  period_spent: u128,
});

export const card = z.strictObject({
  id,
  label: z.string().min(1).max(64),
  kind: cardKind,
  public_key: publicKey,
  status: cardStatus,
  policy,
  spend,
  created_at: u64,
});

export const payment = z.strictObject({
  id,
  card_id: id,
  merchant: accountId,
  token: accountId,
  amount: u128,
  memo: z.string().nullable(),
  reference: z.string().nullable(),
  status: paymentStatus,
  queue_cause: queueCause.nullable(),
  approved_by: accountId.nullable(),
  created_at: u64,
  day: id,
  period: id,
});

export const paymentDecision = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("submitted"), payment_id: id }),
  z.strictObject({ status: z.literal("queued"), payment_id: id, cause: queueCause }),
  z.strictObject({ status: z.literal("rejected"), reason: rejectReason }),
]);

export const paymentPreview = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("allowed") }),
  z.strictObject({ status: z.literal("needs_approval"), cause: queueCause }),
  z.strictObject({ status: z.literal("rejected"), reason: rejectReason }),
]);

export const tokenBalance = z.strictObject({
  token: accountId,
  accepted: z.boolean(),
  available: u128,
  reserved: u128,
});

export const approver = z.strictObject({ account_id: accountId, max_amount: u128 });

export const vaultConfig = z.strictObject({
  owner: accountId,
  pending_owner: accountId.nullable(),
  factory: accountId.nullable(),
  registry: accountId.nullable(),
  approval_ttl: u64,
  contract_version: z.string(),
});

export type CardKind = z.infer<typeof cardKind>;
export type CardStatus = z.infer<typeof cardStatus>;
export type RiskMode = z.infer<typeof riskMode>;
export type RegistryStatus = z.infer<typeof registryStatus>;
export type QueueCause = z.infer<typeof queueCause>;
export type FailureCause = z.infer<typeof failureCause>;
export type RejectReason = z.infer<typeof rejectReason>;
export type MerchantRule = z.infer<typeof merchantRule>;
export type Policy = z.infer<typeof policy>;
export type Card = z.infer<typeof card>;
export type Payment = z.infer<typeof payment>;
export type PaymentDecision = z.infer<typeof paymentDecision>;
export type PaymentPreview = z.infer<typeof paymentPreview>;
export type TokenBalance = z.infer<typeof tokenBalance>;
export type Approver = z.infer<typeof approver>;
export type VaultConfig = z.infer<typeof vaultConfig>;
