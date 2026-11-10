import { describe, expect, it } from "vitest";
import { assessRisk, CODE_CHANGE_WINDOW_NS, type RiskSignals } from "../../src/risk/assess.js";

const NOW = 1_800_000_000_000_000_000n;
const clean: RiskSignals = {
  accountId: "shop.testnet",
  registryStatus: "clear",
  reportCount: 0,
  exists: true,
  isContract: false,
  codeChangedAt: null,
  priorPayments: 3,
  firstPaidAt: NOW - 1n,
  now: NOW,
};

const codes = (signals: RiskSignals) => assessRisk(signals).reasons.map((r) => r.code);

describe("assessRisk", () => {
  it("allows a known, clear counterparty without reasons", () => {
    expect(assessRisk(clean)).toMatchObject({ verdict: "allow", reasons: [] });
  });

  it("blocks registry blocked accounts and warns on flagged ones", () => {
    expect(assessRisk({ ...clean, registryStatus: "blocked" }).verdict).toBe("block");
    expect(assessRisk({ ...clean, registryStatus: "flagged" }).verdict).toBe("warn");
  });

  it("mentions reports that have no curator decision yet", () => {
    const result = assessRisk({ ...clean, reportCount: 2 });
    expect(result.verdict).toBe("allow");
    expect(result.reasons[0]?.detail).toContain("2 report(s)");
  });

  it("warns on missing accounts and recent contract code changes only", () => {
    expect(assessRisk({ ...clean, exists: false }).verdict).toBe("warn");
    const contract = { ...clean, isContract: true };
    expect(assessRisk({ ...contract, codeChangedAt: NOW - 1n }).verdict).toBe("warn");
    expect(assessRisk({ ...contract, codeChangedAt: NOW - CODE_CHANGE_WINDOW_NS }).verdict).toBe(
      "allow",
    );
  });

  it("adds informational reasons without changing the verdict", () => {
    const result = assessRisk({ ...clean, exists: null, priorPayments: 0, firstPaidAt: null });
    expect(result.verdict).toBe("allow");
    expect(codes({ ...clean, exists: null, priorPayments: 0, firstPaidAt: null })).toEqual([
      "chain_lookup_failed",
      "first_payment",
      "never_paid",
    ]);
  });

  it("serializes signals for the API", () => {
    expect(assessRisk({ ...clean, codeChangedAt: 5n, priorPayments: null }).signals).toEqual({
      registry_status: "clear",
      report_count: 0,
      exists: true,
      is_contract: false,
      code_changed_at: "5",
      prior_payments: null,
      first_paid_at: (NOW - 1n).toString(),
    });
  });
});
