import { z } from "zod";
import { accountId } from "./primitives.js";
import { registryStatus } from "./types.js";

/** Indexer counterparty verdict: refuse on `block`, ask a human on `warn`. */
export const riskVerdict = z.enum(["allow", "warn", "block"]);
export const riskLevel = z.enum(["info", "warn", "block"]);

export const riskReason = z.strictObject({
  code: z.string().min(1),
  level: riskLevel,
  detail: z.string(),
});

/** Response of the indexer `GET /risk/:account?vault=`. */
export const riskAssessment = z.strictObject({
  account_id: accountId,
  verdict: riskVerdict,
  reasons: z.array(riskReason),
  signals: z.strictObject({
    registry_status: registryStatus,
    report_count: z.number().int().nonnegative(),
    exists: z.boolean().nullable(),
    is_contract: z.boolean().nullable(),
    code_changed_at: z.string().nullable(),
    prior_payments: z.number().int().nonnegative().nullable(),
    first_paid_at: z.string().nullable(),
  }),
});

export type RiskVerdict = z.infer<typeof riskVerdict>;
export type RiskLevel = z.infer<typeof riskLevel>;
export type RiskReason = z.infer<typeof riskReason>;
export type RiskAssessment = z.infer<typeof riskAssessment>;
