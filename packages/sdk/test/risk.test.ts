import { describe, expect, it } from "vitest";
import { riskAssessment } from "../src/risk.js";

const assessment = {
  account_id: "scam.testnet",
  verdict: "block",
  reasons: [{ code: "registry_blocked", level: "block", detail: "blocked by the registry" }],
  signals: {
    registry_status: "blocked",
    report_count: 1,
    exists: true,
    is_contract: false,
    code_changed_at: null,
    prior_payments: 0,
    first_paid_at: null,
  },
};

describe("riskAssessment", () => {
  it("accepts an indexer verdict", () => {
    expect(riskAssessment.parse(assessment)).toEqual(assessment);
  });

  it("rejects unknown verdicts and extra fields", () => {
    expect(riskAssessment.safeParse({ ...assessment, verdict: "maybe" }).success).toBe(false);
    expect(riskAssessment.safeParse({ ...assessment, score: 3 }).success).toBe(false);
  });
});
