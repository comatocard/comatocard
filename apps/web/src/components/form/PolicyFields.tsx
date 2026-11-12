"use client";
import type { PolicyForm } from "../../lib/policy-form";
import { Choice, Field, TextArea } from "./Field";

const MERCHANT_MODES = [
  { value: "any", label: "Any merchant" },
  { value: "allow", label: "Only these" },
  { value: "deny", label: "All but these" },
] as const;

const RISK_MODES = [
  { value: "off", label: "Off" },
  { value: "block_only", label: "Refuse blocked" },
  { value: "strict", label: "Strict" },
] as const;

const RISK_HINT = {
  off: "The vault does not ask the registry before paying.",
  block_only: "Payments to accounts the registry blocks are refused on chain.",
  strict: "Blocked accounts are refused, flagged ones wait for your approval.",
} as const;

/** Every field of a card policy. Limits are hard ceilings; the threshold only asks you first. */
export function PolicyFields({
  form,
  onChange,
  symbol,
  error,
}: {
  form: PolicyForm;
  onChange: (form: PolicyForm) => void;
  symbol: string;
  error: { field: keyof PolicyForm; message: string } | null;
}) {
  const set = <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]) =>
    onChange({ ...form, [key]: value });
  const errorFor = (field: keyof PolicyForm) => (error?.field === field ? error.message : null);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <Field
          label="Per payment"
          inputMode="decimal"
          value={form.perTx}
          onChange={(e) => set("perTx", e.target.value)}
          error={errorFor("perTx")}
        />
        <Field
          label="Per day"
          inputMode="decimal"
          value={form.daily}
          onChange={(e) => set("daily", e.target.value)}
          error={errorFor("daily")}
        />
        <Field
          label="Per 30 days"
          inputMode="decimal"
          value={form.monthly}
          onChange={(e) => set("monthly", e.target.value)}
          error={errorFor("monthly")}
        />
      </div>
      <Field
        label="Ask me above"
        inputMode="decimal"
        placeholder="Never ask"
        suffix={symbol}
        value={form.threshold}
        onChange={(e) => set("threshold", e.target.value)}
        error={errorFor("threshold")}
        hint="Payments within the limits but above this amount wait for your approval."
      />
      <Choice
        label="Merchants"
        options={MERCHANT_MODES}
        value={form.merchantMode}
        onChange={(v) => set("merchantMode", v)}
      />
      {form.merchantMode === "any" ? null : (
        <TextArea
          label={form.merchantMode === "allow" ? "Allowed accounts" : "Refused accounts"}
          placeholder="shop.testnet"
          value={form.merchants}
          onChange={(e) => set("merchants", e.target.value)}
          error={errorFor("merchants")}
          hint="NEAR accounts, one per line."
        />
      )}
      <Choice
        label="Counterparty check"
        options={RISK_MODES}
        value={form.riskMode}
        onChange={(v) => set("riskMode", v)}
      />
      <p className="-mt-2 text-[12.5px] text-muted">{RISK_HINT[form.riskMode]}</p>
      <Field
        label="Expires"
        type="date"
        value={form.expires}
        onChange={(e) => set("expires", e.target.value)}
        error={errorFor("expires")}
        hint="Optional. The card stops paying after this day (UTC)."
      />
    </div>
  );
}
