import type { Policy } from "@comatocard/sdk";
import { merchantsText } from "../../lib/cards";
import { changedFields } from "../../lib/policy-form";
import { displayUnits } from "../../lib/units";

const LABEL: Record<keyof Policy, string> = {
  per_tx_limit: "Per payment",
  daily_limit: "Per day",
  monthly_limit: "Per 30 days",
  approval_threshold: "Ask me above",
  merchants: "Merchants",
  risk_mode: "Counterparty check",
  valid_from: "Valid from",
  expires_at: "Expires",
  token: "Token",
};

const RISK = { off: "Off", block_only: "Refuse blocked", strict: "Strict" } as const;

function show(field: keyof Policy, policy: Policy, decimals: number, symbol: string): string {
  const value = policy[field];
  if (value === null) return field === "approval_threshold" ? "Never ask" : "None";
  switch (field) {
    case "per_tx_limit":
    case "daily_limit":
    case "monthly_limit":
    case "approval_threshold":
      return `${displayUnits(value as string, decimals)} ${symbol}`;
    case "merchants":
      return merchantsText(policy.merchants);
    case "risk_mode":
      return RISK[policy.risk_mode];
    case "valid_from":
    case "expires_at":
      return new Date(Number(BigInt(value as string) / 1_000_000n)).toISOString().slice(0, 10);
    default:
      return String(value);
  }
}

/** Before and after for every field that changes. Nothing else is listed. */
export function PolicyDiff({
  before,
  after,
  decimals,
  symbol,
}: {
  before: Policy;
  after: Policy;
  decimals: number;
  symbol: string;
}) {
  const fields = changedFields(before, after);
  if (fields.length === 0) {
    return <p className="text-center text-[13px] text-muted">Nothing changes yet.</p>;
  }
  return (
    <div className="divide-y divide-line rounded-[16px] border border-line bg-white px-4">
      {fields.map((f) => (
        <div key={f} className="py-3">
          <div className="text-[12px] font-medium text-muted">{LABEL[f]}</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
            <span className="text-muted line-through decoration-1">
              {show(f, before, decimals, symbol)}
            </span>
            <span aria-hidden="true" className="text-muted">
              →
            </span>
            <span className="font-semibold">{show(f, after, decimals, symbol)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
