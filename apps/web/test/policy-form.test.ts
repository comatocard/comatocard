import type { Policy } from "@comatocard/sdk";
import { describe, expect, it } from "vitest";
import { changedFields, DEFAULT_FORM, fromPolicy, toPolicy } from "../src/lib/policy-form";

const input = { token: "tusd.comatocard.testnet", decimals: 6 };

describe("policy form", () => {
  it("turns the default form into a valid policy", () => {
    const result = toPolicy(DEFAULT_FORM, input);
    expect(result).toEqual({
      ok: true,
      policy: {
        token: input.token,
        per_tx_limit: "20000000",
        daily_limit: "50000000",
        monthly_limit: "200000000",
        approval_threshold: "10000000",
        merchants: "any",
        valid_from: null,
        expires_at: null,
        risk_mode: "block_only",
      },
    });
  });

  it("keeps limits ordered: per payment <= day <= 30 days", () => {
    expect(toPolicy({ ...DEFAULT_FORM, perTx: "60" }, input)).toMatchObject({
      ok: false,
      field: "perTx",
    });
    expect(toPolicy({ ...DEFAULT_FORM, daily: "500" }, input)).toMatchObject({
      ok: false,
      field: "daily",
    });
    expect(toPolicy({ ...DEFAULT_FORM, monthly: "0" }, input)).toMatchObject({
      ok: false,
      field: "monthly",
    });
  });

  it("validates and dedupes merchant accounts", () => {
    const allow = toPolicy(
      {
        ...DEFAULT_FORM,
        merchantMode: "allow",
        merchants: "Shop.testnet, shop.testnet\nb.testnet",
      },
      input,
    );
    expect(allow.ok && allow.policy.merchants).toEqual({ allow: ["shop.testnet", "b.testnet"] });
    expect(toPolicy({ ...DEFAULT_FORM, merchantMode: "deny", merchants: "" }, input)).toMatchObject(
      {
        ok: false,
        field: "merchants",
      },
    );
    expect(
      toPolicy({ ...DEFAULT_FORM, merchantMode: "allow", merchants: "not an account!" }, input),
    ).toMatchObject({ ok: false, field: "merchants" });
  });

  it("makes the threshold optional and ends an expiry date at 23:59:59 UTC", () => {
    const result = toPolicy({ ...DEFAULT_FORM, threshold: "", expires: "2026-12-31" }, input);
    expect(result.ok && result.policy.approval_threshold).toBeNull();
    expect(result.ok && result.policy.expires_at).toBe(
      (BigInt(Date.parse("2026-12-31T23:59:59Z")) * 1_000_000n).toString(),
    );
  });

  it("round-trips an existing policy and lists what changed", () => {
    const first = toPolicy(
      { ...DEFAULT_FORM, merchantMode: "allow", merchants: "shop.testnet" },
      input,
    );
    if (!first.ok) throw new Error("expected a policy");
    const form = fromPolicy(first.policy, 6);
    const again = toPolicy(form, input);
    expect(again.ok && again.policy).toEqual(first.policy);
    const lowered: Policy = { ...first.policy, daily_limit: "40000000" };
    expect(changedFields(first.policy, lowered)).toEqual(["daily_limit"]);
  });
});
