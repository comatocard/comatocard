import { z } from "zod";
import { accountId, id, publicKey, u64, u128 } from "./primitives.js";
import { cardKind, cardStatus, policy, queueCause } from "./types.js";

// Response bodies of the indexer REST API (`docs/specs/indexer-api.md`). Timestamps are nanosecond
// strings; amounts are strings in the token's smallest unit.

/** Status of an indexed payment row. Every attempt is one row, rejections included. */
export const paymentRowStatus = z.enum([
  "submitted",
  "queued",
  "approved",
  "settled",
  "failed",
  "declined",
  "expired",
  "rejected",
]);

/** `GET /vaults?owner=` items. */
export const vaultRow = z.strictObject({
  vault_id: accountId,
  owner_id: accountId,
  pending_owner_id: accountId.nullable().optional(),
  factory_id: accountId,
  code_version: z.number().int(),
  created_at: u64,
});

export const indexedBalance = z.strictObject({ token: accountId, available: u128, reserved: u128 });

/** `GET /vaults/:vault`. `get_balances` on the vault stays authoritative for balances. */
export const vaultSummary = vaultRow.extend({
  card_count: z.number().int().nonnegative(),
  spent_today: u128,
  indexed_balances: z.array(indexedBalance),
});

/** `GET /vaults/:vault/cards` and `GET /cards?holder=` items. Live spend comes from `list_cards`. */
export const indexedCard = z.strictObject({
  vault_id: accountId,
  card_id: id,
  public_key: publicKey.nullable(),
  holder_id: accountId.nullable(),
  label: z.string(),
  kind: cardKind,
  status: cardStatus,
  policy,
  created_at: u64,
  updated_at: u64,
});

/** One payment attempt. `payment_id` is null for rejections, which the vault never stores. */
export const paymentRow = z.strictObject({
  id: id,
  payment_id: id.nullable(),
  vault_id: accountId,
  card_id: id,
  merchant: accountId,
  token: accountId,
  amount: u128,
  memo: z.string().nullable(),
  reference: z.string().nullable(),
  status: paymentRowStatus,
  queue_cause: queueCause.nullable(),
  /** The reject reason or the failure cause. */
  reason: z.string().nullable(),
  approver_id: accountId.nullable(),
  tx_hash: z.string().nullable(),
  created_at: u64,
  updated_at: u64,
});

/** `GET /vaults/:vault/payments`, newest first. */
export const paymentPage = z.strictObject({
  items: z.array(paymentRow),
  next_cursor: z.string().nullable(),
});

export const paymentEvent = z.strictObject({
  event: z.string(),
  data: z.record(z.string(), z.unknown()),
  block_height: z.number().int().nonnegative(),
  tx_hash: z.string().nullable(),
  timestamp: u64,
});

/** `GET /vaults/:vault/payments/:id`: the row with every event of that payment. */
export const paymentDetail = paymentRow.extend({ events: z.array(paymentEvent) });

/** `GET /vaults/:vault/cards/:card`. */
export const cardDetail = indexedCard.extend({ recent_payments: z.array(paymentRow) });

/** `GET /vaults/:vault/approvals`: queued payments and approver limits. */
export const approvalsResponse = z.strictObject({
  items: z.array(paymentRow),
  approvers: z.array(z.strictObject({ account_id: accountId, max_amount: u128 })),
});

/** `GET /health`. */
export const indexerHealth = z.strictObject({
  status: z.enum(["ok", "starting"]),
  indexed_height: z.number().int().nullable(),
  chain_height: z.number().int().nullable(),
  lag: z.number().int().nullable(),
});

/** One message of `WS /stream?vault=` or `?merchant=`, sent after its block is committed. */
export const streamEvent = z.strictObject({
  contract_id: accountId,
  event: z.string(),
  data: z.record(z.string(), z.unknown()),
  block_height: z.number().int().nonnegative(),
  tx_hash: z.string().nullable(),
  timestamp: u64,
});

export type PaymentRowStatus = z.infer<typeof paymentRowStatus>;
export type VaultRow = z.infer<typeof vaultRow>;
export type IndexedBalance = z.infer<typeof indexedBalance>;
export type VaultSummary = z.infer<typeof vaultSummary>;
export type IndexedCard = z.infer<typeof indexedCard>;
export type PaymentRow = z.infer<typeof paymentRow>;
export type PaymentPage = z.infer<typeof paymentPage>;
export type PaymentEvent = z.infer<typeof paymentEvent>;
export type PaymentDetail = z.infer<typeof paymentDetail>;
export type CardDetail = z.infer<typeof cardDetail>;
export type ApprovalsResponse = z.infer<typeof approvalsResponse>;
export type IndexerHealth = z.infer<typeof indexerHealth>;
export type StreamEvent = z.infer<typeof streamEvent>;
