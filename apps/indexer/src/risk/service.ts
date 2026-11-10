import { and, count, eq, min, ne } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { accountCode, payments, registryReports, registryStatuses } from "../db/schema.js";
import { assessRisk, type RiskAssessment } from "./assess.js";
import type { ChainReader } from "./chain.js";

export interface RiskServiceOptions {
  db: Database;
  chain: ChainReader;
  registryId: string | undefined;
  now?: () => bigint;
}

const nowNs = () => BigInt(Date.now()) * 1_000_000n;

/** Collects the signals for a counterparty and returns the assessment. */
export function riskService(options: RiskServiceOptions) {
  const now = options.now ?? nowNs;
  const { db } = options;

  async function codeChangedAt(accountId: string, codeHash: string): Promise<bigint | null> {
    const observedAt = now().toString();
    await db
      .insert(accountCode)
      .values({ accountId, codeHash, firstSeenAt: observedAt })
      .onConflictDoNothing();
    const [current] = await db
      .select({ firstSeenAt: accountCode.firstSeenAt })
      .from(accountCode)
      .where(and(eq(accountCode.accountId, accountId), eq(accountCode.codeHash, codeHash)));
    const [other] = await db
      .select({ n: count() })
      .from(accountCode)
      .where(and(eq(accountCode.accountId, accountId), ne(accountCode.codeHash, codeHash)));
    return (other?.n ?? 0) > 0 && current ? BigInt(current.firstSeenAt) : null;
  }

  return async function assess(accountId: string, vaultId?: string): Promise<RiskAssessment> {
    const registryId = options.registryId;
    const [status] = registryId
      ? await db
          .select({ status: registryStatuses.status })
          .from(registryStatuses)
          .where(
            and(
              eq(registryStatuses.registryId, registryId),
              eq(registryStatuses.accountId, accountId),
            ),
          )
      : [];
    const [reports] = await db
      .select({ n: count() })
      .from(registryReports)
      .where(eq(registryReports.accountId, accountId));
    const settledTo = and(eq(payments.merchant, accountId), eq(payments.status, "settled"));
    const [prior] = vaultId
      ? await db
          .select({ n: count() })
          .from(payments)
          .where(and(settledTo, eq(payments.vaultId, vaultId)))
      : [];
    const [first] = await db
      .select({ at: min(payments.createdAt) })
      .from(payments)
      .where(settledTo);

    const chain = await options.chain(accountId);
    const changedAt = chain?.codeHash ? await codeChangedAt(accountId, chain.codeHash) : null;

    return assessRisk({
      accountId,
      registryStatus: (status?.status as "clear" | "flagged" | "blocked" | undefined) ?? "clear",
      reportCount: reports?.n ?? 0,
      exists: chain ? chain.exists : null,
      isContract: chain ? chain.codeHash !== null : null,
      codeChangedAt: changedAt,
      priorPayments: vaultId ? (prior?.n ?? 0) : null,
      firstPaidAt: first?.at ? BigInt(first.at) : null,
      now: now(),
    });
  };
}

export type RiskService = ReturnType<typeof riskService>;
