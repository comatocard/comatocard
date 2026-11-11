import { describe, expect, it } from "vitest";
import { cardWarnings, publicTextWarnings } from "../src/compliance.js";
import type { Policy } from "../src/types.js";

const policy: Policy = {
  token: "tusd.testnet",
  per_tx_limit: "1",
  daily_limit: "1",
  monthly_limit: "1",
  approval_threshold: null,
  merchants: "any",
  valid_from: null,
  expires_at: null,
  risk_mode: "off",
};

describe("issue 73: compliance warnings", () => {
  it("flags personal data in public fields", () => {
    const warnings = publicTextWarnings({
      memo: "invoice for budi@example.com",
      reference: "081234567890",
      label: "NIK 3171234567890001",
      clean: "inv-2026-0042",
      empty: null,
    });
    expect(warnings.map((w) => w.field)).toEqual(["memo", "reference", "label"]);
    expect(warnings.every((w) => w.code === "personal_data")).toBe(true);
    expect(publicTextWarnings({ memo: "+6281234567890" })).toHaveLength(1);
    expect(publicTextWarnings({ memo: "api credits, 40 tUSD" })).toEqual([]);
  });

  it("asks agent cards to check counterparties", () => {
    expect(cardWarnings({ kind: "agent", policy }).map((w) => w.code)).toEqual([
      "agent_without_checks",
    ]);
    expect(cardWarnings({ kind: "agent", policy: { ...policy, risk_mode: "block_only" } })).toEqual(
      [],
    );
    expect(cardWarnings({ kind: "human", policy })).toEqual([]);
  });
});
