import type {
  RegistryStatus,
  RiskAssessment,
  RiskLevel,
  RiskReason,
  RiskVerdict,
} from "@comatocard/sdk";

/** Facts about a counterparty that the verdict is derived from. */
export interface RiskSignals {
  accountId: string;
  registryStatus: RegistryStatus;
  reportCount: number;
  /** `null` when the chain lookup failed. */
  exists: boolean | null;
  isContract: boolean | null;
  /** When the current contract code was first observed, if a different code was seen before. */
  codeChangedAt: bigint | null;
  /** Settled payments from the asking vault, `null` when no vault was given. */
  priorPayments: number | null;
  /** First settled payment to this account by any indexed vault. */
  firstPaidAt: bigint | null;
  now: bigint;
}

/** A contract whose code changed within this window is treated with caution. */
export const CODE_CHANGE_WINDOW_NS = 7n * 24n * 3_600n * 1_000_000_000n;

/** Turns signals into a verdict. Pure, so every rule is unit tested. */
export function assessRisk(signals: RiskSignals): RiskAssessment {
  const reasons: RiskReason[] = [];
  const add = (code: string, level: RiskLevel, detail: string) =>
    reasons.push({ code, level, detail });

  if (signals.registryStatus === "blocked") {
    add("registry_blocked", "block", "a registry curator blocked this account");
  } else if (signals.registryStatus === "flagged") {
    add("registry_flagged", "warn", "a registry curator flagged this account");
  } else if (signals.reportCount > 0) {
    add("reported", "info", `${signals.reportCount} report(s) without a curator decision`);
  }
  if (signals.exists === false) {
    add("account_missing", "warn", "the account does not exist on chain");
  }
  if (signals.exists === null) {
    add("chain_lookup_failed", "info", "account details could not be read from the chain");
  }
  if (
    signals.isContract &&
    signals.codeChangedAt !== null &&
    signals.now - signals.codeChangedAt < CODE_CHANGE_WINDOW_NS
  ) {
    add("code_changed_recently", "warn", "the contract code changed in the last 7 days");
  }
  if (signals.priorPayments === 0) {
    add("first_payment", "info", "this vault has never paid this account");
  }
  if (signals.firstPaidAt === null) {
    add("never_paid", "info", "no indexed vault has paid this account before");
  }

  const verdict: RiskVerdict = reasons.some((r) => r.level === "block")
    ? "block"
    : reasons.some((r) => r.level === "warn")
      ? "warn"
      : "allow";

  return {
    account_id: signals.accountId,
    verdict,
    reasons,
    signals: {
      registry_status: signals.registryStatus,
      report_count: signals.reportCount,
      exists: signals.exists,
      is_contract: signals.isContract,
      code_changed_at: signals.codeChangedAt?.toString() ?? null,
      prior_payments: signals.priorPayments,
      first_paid_at: signals.firstPaidAt?.toString() ?? null,
    },
  };
}
