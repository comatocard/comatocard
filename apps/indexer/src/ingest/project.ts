import type { ComatocardEvent } from "@comatocard/sdk";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  approvers,
  cards,
  payments,
  registryReports,
  registryStatuses,
  tokenFlows,
  vaults,
} from "../db/schema.js";

/** Where an event was recorded. */
export interface EventOrigin {
  contractId: string;
  receiptId: string;
  logIndex: number;
  blockHeight: number;
  blockTimestamp: string;
  txHash: string | null;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const sqlPaymentIdNotNull = sql`${payments.paymentId} is not null`;

type PaymentStatus =
  | "submitted"
  | "queued"
  | "approved"
  | "declined"
  | "expired"
  | "settled"
  | "failed"
  | "rejected";

async function updatePayment(
  tx: Tx,
  origin: EventOrigin,
  paymentId: number,
  values: { status: PaymentStatus; reason?: string; approverId?: string },
) {
  await tx
    .update(payments)
    .set({ ...values, updatedAt: origin.blockTimestamp, updatedHeight: origin.blockHeight })
    .where(and(eq(payments.vaultId, origin.contractId), eq(payments.paymentId, paymentId)));
}

async function setCardStatus(tx: Tx, origin: EventOrigin, cardId: number, status: string) {
  await tx
    .update(cards)
    .set({ status, updatedAt: origin.blockTimestamp })
    .where(and(eq(cards.vaultId, origin.contractId), eq(cards.cardId, cardId)));
}

/**
 * Applies one validated event to the projections. Called inside the transaction that stores the
 * raw event, and only when the raw event was new, so replays never double count.
 */
export async function project(tx: Tx, origin: EventOrigin, event: ComatocardEvent): Promise<void> {
  const at = origin.blockTimestamp;
  const vaultId = origin.contractId;
  switch (event.event) {
    case "vault_code_published":
      return;
    case "vault_created":
      await tx
        .insert(vaults)
        .values({
          vaultId: event.data.vault_id,
          ownerId: event.data.owner_id,
          factoryId: origin.contractId,
          codeVersion: event.data.code_version,
          createdHeight: origin.blockHeight,
          createdAt: at,
        })
        .onConflictDoNothing();
      return;
    case "owner_proposed":
      await tx
        .update(vaults)
        .set({ pendingOwnerId: event.data.owner_id })
        .where(eq(vaults.vaultId, vaultId));
      return;
    case "owner_changed":
      await tx
        .update(vaults)
        .set({ ownerId: event.data.owner_id, pendingOwnerId: null })
        .where(eq(vaults.vaultId, vaultId));
      return;
    case "card_created":
      await tx.insert(cards).values({
        vaultId,
        cardId: event.data.card_id,
        publicKey: event.data.public_key,
        label: event.data.label,
        kind: event.data.kind,
        status: "active",
        policy: event.data.policy,
        createdAt: at,
        updatedAt: at,
      });
      return;
    case "card_policy_updated":
      await tx
        .update(cards)
        .set({ policy: event.data.policy, updatedAt: at })
        .where(and(eq(cards.vaultId, vaultId), eq(cards.cardId, event.data.card_id)));
      return;
    case "card_frozen":
      return setCardStatus(tx, origin, event.data.card_id, "frozen");
    case "card_unfrozen":
      return setCardStatus(tx, origin, event.data.card_id, "active");
    case "card_revoked":
      return setCardStatus(tx, origin, event.data.card_id, "revoked");
    case "card_key_rotated":
      await tx
        .update(cards)
        .set({ publicKey: event.data.new_public_key, updatedAt: at })
        .where(and(eq(cards.vaultId, vaultId), eq(cards.cardId, event.data.card_id)));
      return;
    case "card_transferred": {
      // Mirrors the contract: a card handed back to the owner follows future ownership changes.
      const [vault] = await tx
        .select({ ownerId: vaults.ownerId })
        .from(vaults)
        .where(eq(vaults.vaultId, vaultId));
      const holderId = event.data.new_holder === vault?.ownerId ? null : event.data.new_holder;
      await tx
        .update(cards)
        .set({ holderId, publicKey: null, updatedAt: at })
        .where(and(eq(cards.vaultId, vaultId), eq(cards.cardId, event.data.card_id)));
      return;
    }
    case "approver_set":
      if (event.data.max_amount === null) {
        await tx
          .delete(approvers)
          .where(
            and(eq(approvers.vaultId, vaultId), eq(approvers.accountId, event.data.account_id)),
          );
      } else {
        await tx
          .insert(approvers)
          .values({ vaultId, accountId: event.data.account_id, maxAmount: event.data.max_amount })
          .onConflictDoUpdate({
            target: [approvers.vaultId, approvers.accountId],
            set: { maxAmount: event.data.max_amount },
          });
      }
      return;
    case "deposit":
    case "withdrawal": {
      const isDeposit = event.event === "deposit";
      await tx.insert(tokenFlows).values({
        receiptId: origin.receiptId,
        logIndex: origin.logIndex,
        vaultId,
        kind: event.event,
        token: event.data.token,
        counterparty: isDeposit ? event.data.sender_id : event.data.receiver_id,
        amount: event.data.amount,
        success: isDeposit ? true : event.data.success,
        txHash: origin.txHash,
        createdAt: at,
      });
      return;
    }
    case "payment_submitted":
    case "payment_queued": {
      const queued = event.event === "payment_queued";
      const status: PaymentStatus = queued ? "queued" : "submitted";
      const queueCause = queued ? event.data.cause : null;
      await tx
        .insert(payments)
        .values({
          vaultId,
          paymentId: event.data.payment_id,
          cardId: event.data.card_id,
          merchant: event.data.merchant,
          token: event.data.token,
          amount: event.data.amount,
          memo: event.data.memo,
          reference: event.data.reference,
          status,
          queueCause,
          originReceiptId: origin.receiptId,
          originLogIndex: origin.logIndex,
          txHash: origin.txHash,
          createdAt: at,
          updatedAt: at,
          updatedHeight: origin.blockHeight,
        })
        .onConflictDoUpdate({
          target: [payments.vaultId, payments.paymentId],
          targetWhere: sqlPaymentIdNotNull,
          set: { status, queueCause, updatedAt: at, updatedHeight: origin.blockHeight },
        });
      return;
    }
    case "payment_approved":
      return updatePayment(tx, origin, event.data.payment_id, {
        status: "approved",
        approverId: event.data.approver_id,
      });
    case "payment_declined":
      return updatePayment(tx, origin, event.data.payment_id, {
        status: "declined",
        approverId: event.data.approver_id,
      });
    case "payment_expired":
      return updatePayment(tx, origin, event.data.payment_id, { status: "expired" });
    case "payment_settled":
      return updatePayment(tx, origin, event.data.payment_id, { status: "settled" });
    case "payment_failed":
      return updatePayment(tx, origin, event.data.payment_id, {
        status: "failed",
        reason: event.data.cause,
      });
    case "payment_rejected":
      await tx.insert(payments).values({
        vaultId,
        paymentId: null,
        cardId: event.data.card_id,
        merchant: event.data.merchant,
        token: event.data.token,
        amount: event.data.amount,
        reference: event.data.reference,
        status: "rejected",
        reason: event.data.reason,
        originReceiptId: origin.receiptId,
        originLogIndex: origin.logIndex,
        txHash: origin.txHash,
        createdAt: at,
        updatedAt: at,
        updatedHeight: origin.blockHeight,
      });
      return;
    case "report_submitted":
      await tx.insert(registryReports).values({
        registryId: origin.contractId,
        reportId: event.data.report_id,
        accountId: event.data.account_id,
        reporterId: event.data.reporter_id,
        category: event.data.category,
        evidenceUri: event.data.evidence_uri,
        createdAt: at,
      });
      return;
    case "status_changed":
      await tx
        .insert(registryStatuses)
        .values({
          registryId: origin.contractId,
          accountId: event.data.account_id,
          status: event.data.status,
          curatorId: event.data.curator_id,
          reportIds: event.data.report_ids,
          updatedAt: at,
        })
        .onConflictDoUpdate({
          target: [registryStatuses.registryId, registryStatuses.accountId],
          set: {
            status: event.data.status,
            curatorId: event.data.curator_id,
            reportIds: event.data.report_ids,
            updatedAt: at,
          },
        });
      return;
  }
}
