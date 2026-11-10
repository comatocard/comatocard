import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const amount = (name: string) => numeric(name, { precision: 39, scale: 0 });
const height = (name: string) => bigint(name, { mode: "number" });
/** Nanosecond timestamps exceed 2^53, so they are stored as numeric strings. */
const nanos = (name: string) => numeric(name, { precision: 20, scale: 0 });

/** Every validated event, the source of truth the projections are derived from. */
export const events = pgTable(
  "events",
  {
    receiptId: text("receipt_id").notNull(),
    logIndex: integer("log_index").notNull(),
    blockHeight: height("block_height").notNull(),
    blockTimestamp: nanos("block_timestamp").notNull(),
    txHash: text("tx_hash"),
    contractId: text("contract_id").notNull(),
    event: text("event").notNull(),
    version: text("version").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.receiptId, t.logIndex] }),
    index("events_contract_height").on(t.contractId, t.blockHeight),
  ],
);

/** Comatocard events that failed validation, kept for inspection instead of being dropped. */
export const deadLetters = pgTable(
  "dead_letters",
  {
    receiptId: text("receipt_id").notNull(),
    logIndex: integer("log_index").notNull(),
    blockHeight: height("block_height").notNull(),
    contractId: text("contract_id").notNull(),
    line: text("line").notNull(),
    error: text("error").notNull(),
  },
  (t) => [primaryKey({ columns: [t.receiptId, t.logIndex] })],
);

export const cursor = pgTable("cursor", {
  id: text("id").primaryKey(),
  height: height("height").notNull(),
});

export const vaults = pgTable(
  "vaults",
  {
    vaultId: text("vault_id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    pendingOwnerId: text("pending_owner_id"),
    factoryId: text("factory_id").notNull(),
    codeVersion: integer("code_version").notNull(),
    createdHeight: height("created_height").notNull(),
    createdAt: nanos("created_at").notNull(),
  },
  (t) => [index("vaults_owner").on(t.ownerId)],
);

export const cards = pgTable(
  "cards",
  {
    vaultId: text("vault_id").notNull(),
    cardId: integer("card_id").notNull(),
    publicKey: text("public_key").notNull(),
    label: text("label").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    policy: jsonb("policy").notNull(),
    createdAt: nanos("created_at").notNull(),
    updatedAt: nanos("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.vaultId, t.cardId] })],
);

/**
 * One row per payment attempt. Stored payments are keyed by `(vault_id, payment_id)`;
 * rejections have no payment id and are keyed by the receipt and log that recorded them.
 */
export const payments = pgTable(
  "payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    vaultId: text("vault_id").notNull(),
    paymentId: bigint("payment_id", { mode: "number" }),
    cardId: integer("card_id").notNull(),
    merchant: text("merchant").notNull(),
    token: text("token").notNull(),
    amount: amount("amount").notNull(),
    memo: text("memo"),
    reference: text("reference"),
    status: text("status").notNull(),
    /** Why the payment waited for approval, kept after it settles. */
    queueCause: text("queue_cause"),
    /** Why the payment was rejected or failed. */
    reason: text("reason"),
    approverId: text("approver_id"),
    originReceiptId: text("origin_receipt_id").notNull(),
    originLogIndex: integer("origin_log_index").notNull(),
    txHash: text("tx_hash"),
    createdAt: nanos("created_at").notNull(),
    updatedAt: nanos("updated_at").notNull(),
    updatedHeight: height("updated_height").notNull(),
  },
  (t) => [
    uniqueIndex("payments_vault_payment")
      .on(t.vaultId, t.paymentId)
      .where(sql`${t.paymentId} is not null`),
    uniqueIndex("payments_origin").on(t.originReceiptId, t.originLogIndex),
    index("payments_vault_id").on(t.vaultId, t.id),
    index("payments_merchant").on(t.merchant, t.reference),
  ],
);

export const approvers = pgTable(
  "approvers",
  {
    vaultId: text("vault_id").notNull(),
    accountId: text("account_id").notNull(),
    maxAmount: amount("max_amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.vaultId, t.accountId] })],
);

export const tokenFlows = pgTable(
  "token_flows",
  {
    receiptId: text("receipt_id").notNull(),
    logIndex: integer("log_index").notNull(),
    vaultId: text("vault_id").notNull(),
    kind: text("kind").notNull(),
    token: text("token").notNull(),
    counterparty: text("counterparty").notNull(),
    amount: amount("amount").notNull(),
    success: boolean("success").notNull(),
    txHash: text("tx_hash"),
    createdAt: nanos("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.receiptId, t.logIndex] }),
    index("token_flows_vault").on(t.vaultId),
  ],
);

export const registryReports = pgTable(
  "registry_reports",
  {
    registryId: text("registry_id").notNull(),
    reportId: bigint("report_id", { mode: "number" }).notNull(),
    accountId: text("account_id").notNull(),
    reporterId: text("reporter_id").notNull(),
    category: text("category").notNull(),
    evidenceUri: text("evidence_uri").notNull(),
    createdAt: nanos("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.registryId, t.reportId] }),
    index("registry_reports_account").on(t.accountId),
  ],
);

export const registryStatuses = pgTable(
  "registry_statuses",
  {
    registryId: text("registry_id").notNull(),
    accountId: text("account_id").notNull(),
    status: text("status").notNull(),
    curatorId: text("curator_id").notNull(),
    reportIds: jsonb("report_ids").notNull(),
    updatedAt: nanos("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.registryId, t.accountId] })],
);

/** Code hashes observed for counterparties, used to detect recent contract code changes. */
export const accountCode = pgTable(
  "account_code",
  {
    accountId: text("account_id").notNull(),
    codeHash: text("code_hash").notNull(),
    firstSeenAt: nanos("first_seen_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.codeHash] })],
);
