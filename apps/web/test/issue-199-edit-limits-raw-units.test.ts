import type { Policy } from "@comatocard/sdk";
import { describe, expect, it } from "vitest";
import { fromPolicy, toPolicy } from "../src/lib/policy-form";

const policy: Policy = {
  token: "tusd.comatocard.testnet",
  per_tx_limit: "20000000",
  daily_limit: "50000000",
  monthly_limit: "200000000",
  approval_threshold: "10000000",
  merchants: "any",
  valid_from: null,
  expires_at: null,
  risk_mode: "block_only",
};

// Issue #199: the edit sheet seeded its form with decimals 0 while the token metadata was still
// loading, so it showed 20000000 for 20 tUSD and saving would have multiplied every limit.
describe("issue 199: edit limits before the token is known", () => {
  it("builds no form until the decimals are known", () => {
    expect(fromPolicy(policy, undefined)).toBeNull();
  });

  it("shows whole tokens, and saving an untouched form keeps the limits", () => {
    const form = fromPolicy(policy, 6);
    expect(form).toMatchObject({ perTx: "20", daily: "50", monthly: "200", threshold: "10" });
    if (!form) throw new Error("expected a form");
    const saved = toPolicy(form, { token: policy.token, decimals: 6 });
    expect(saved.ok && saved.policy).toEqual(policy);
  });
});
