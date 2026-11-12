import { accountId, type Policy, type RiskMode } from "@comatocard/sdk";
import { formatUnits, parseUnits } from "./units";

/** The editable form of a card policy: amounts in token units, merchants one per line. */
export interface PolicyForm {
  perTx: string;
  daily: string;
  monthly: string;
  /** Empty means every payment within limits settles without approval. */
  threshold: string;
  merchantMode: "any" | "allow" | "deny";
  merchants: string;
  riskMode: RiskMode;
  /** `YYYY-MM-DD` in UTC, empty for no end date. */
  expires: string;
}

export const DEFAULT_FORM: PolicyForm = {
  perTx: "20",
  daily: "50",
  monthly: "200",
  threshold: "10",
  merchantMode: "any",
  merchants: "",
  riskMode: "block_only",
  expires: "",
};

export type PolicyResult =
  | { ok: true; policy: Policy }
  | { ok: false; field: keyof PolicyForm; message: string };

type Failure = Extract<PolicyResult, { ok: false }>;

const fail = (field: keyof PolicyForm, message: string): Failure => ({ ok: false, field, message });

/** Limits in the smallest unit, or the first field that is not a positive amount in order. */
function parseLimits(form: PolicyForm, decimals: number) {
  const fields = [
    ["perTx", form.perTx],
    ["daily", form.daily],
    ["monthly", form.monthly],
  ] as const;
  const values: string[] = [];
  for (const [field, input] of fields) {
    const value = parseUnits(input, decimals);
    if (!value || value === "0") return fail(field, "Enter an amount above zero.");
    values.push(value);
  }
  const [perTx = "0", daily = "0", monthly = "0"] = values;
  if (BigInt(perTx) > BigInt(daily))
    return fail("perTx", "Per payment can't exceed the day limit.");
  if (BigInt(daily) > BigInt(monthly)) return fail("daily", "The day limit can't exceed 30 days.");
  return { perTx, daily, monthly };
}

function parseMerchants(form: PolicyForm): Policy["merchants"] | Failure {
  const list = form.merchants
    .split(/[\s,]+/)
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  const invalid = list.find((m) => !accountId.safeParse(m).success);
  if (invalid) return fail("merchants", `${invalid} is not a NEAR account.`);
  if (form.merchantMode === "any") return "any";
  if (list.length === 0) return fail("merchants", "Add at least one account.");
  const unique = [...new Set(list)];
  return form.merchantMode === "allow" ? { allow: unique } : { deny: unique };
}

const isFailure = (value: unknown): value is Failure =>
  typeof value === "object" && value !== null && "ok" in value;

/** Parses the form into a policy the vault accepts, or names the first field that is wrong. */
export function toPolicy(
  form: PolicyForm,
  input: { token: string; decimals: number; validFrom?: string | null },
): PolicyResult {
  const limits = parseLimits(form, input.decimals);
  if ("ok" in limits) return limits;

  let threshold: string | null = null;
  if (form.threshold.trim() !== "") {
    threshold = parseUnits(form.threshold, input.decimals);
    if (threshold === null) return fail("threshold", "Enter an amount, or leave it empty.");
  }

  const merchants = parseMerchants(form);
  if (isFailure(merchants)) return merchants;

  let expiresAt: string | null = null;
  if (form.expires) {
    const ms = Date.parse(`${form.expires}T23:59:59Z`);
    if (Number.isNaN(ms)) return fail("expires", "Pick a date.");
    expiresAt = (BigInt(ms) * 1_000_000n).toString();
  }

  return {
    ok: true,
    policy: {
      token: input.token,
      per_tx_limit: limits.perTx,
      daily_limit: limits.daily,
      monthly_limit: limits.monthly,
      approval_threshold: threshold,
      merchants,
      valid_from: input.validFrom ?? null,
      expires_at: expiresAt,
      risk_mode: form.riskMode,
    },
  };
}

/** The form for an existing policy, so an edit starts from what the card has today. */
export function fromPolicy(policy: Policy, decimals: number): PolicyForm {
  let merchantMode: PolicyForm["merchantMode"] = "any";
  let merchants = "";
  if (policy.merchants !== "any") {
    const list = "allow" in policy.merchants ? policy.merchants.allow : policy.merchants.deny;
    merchantMode = "allow" in policy.merchants ? "allow" : "deny";
    merchants = list.join("\n");
  }
  const expires = policy.expires_at
    ? new Date(Number(BigInt(policy.expires_at) / 1_000_000n)).toISOString().slice(0, 10)
    : "";
  return {
    perTx: formatUnits(policy.per_tx_limit, decimals),
    daily: formatUnits(policy.daily_limit, decimals),
    monthly: formatUnits(policy.monthly_limit, decimals),
    threshold:
      policy.approval_threshold === null ? "" : formatUnits(policy.approval_threshold, decimals),
    merchantMode,
    merchants,
    riskMode: policy.risk_mode,
    expires,
  };
}

/** Names of the policy fields that differ, in reading order, for a change summary. */
export function changedFields(before: Policy, after: Policy): (keyof Policy)[] {
  const fields: (keyof Policy)[] = [
    "per_tx_limit",
    "daily_limit",
    "monthly_limit",
    "approval_threshold",
    "merchants",
    "risk_mode",
    "valid_from",
    "expires_at",
    "token",
  ];
  return fields.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
}
