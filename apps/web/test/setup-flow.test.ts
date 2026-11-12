import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, toPolicy } from "../src/lib/policy-form";
import {
  cardEnv,
  DONE_STEP,
  FIRST_CARD_LIMITS,
  firstCardForm,
  resumeStep,
} from "../src/lib/setup-flow";

describe("resumeStep", () => {
  it("starts at the first step that is not done", () => {
    expect(resumeStep([false, false, false])).toBe(0);
    expect(resumeStep([true, false, false])).toBe(1);
    expect(resumeStep([true, true, false])).toBe(2);
  });

  it("does not skip a gap: funds missing after a card still resumes at funds", () => {
    expect(resumeStep([true, false, true])).toBe(1);
  });

  it("reports complete when every step is done", () => {
    expect(resumeStep([true, true, true])).toBe("complete");
  });

  it("puts the done screen after the last step", () => {
    expect(DONE_STEP).toBe(3);
  });
});

describe("firstCardForm", () => {
  it("keeps the policy defaults the step does not ask for", () => {
    const form = firstCardForm(FIRST_CARD_LIMITS);
    expect(form).toEqual(DEFAULT_FORM);
  });

  it("produces a policy the vault accepts", () => {
    const result = toPolicy(
      firstCardForm({ perTx: "5", daily: "25", monthly: "100", askAbove: "" }),
      { token: "tusd.comatocard.testnet", decimals: 6 },
    );
    expect(result).toMatchObject({
      ok: true,
      policy: {
        per_tx_limit: "5000000",
        daily_limit: "25000000",
        monthly_limit: "100000000",
        approval_threshold: null,
        merchants: "any",
        risk_mode: "block_only",
      },
    });
  });

  it("surfaces a limit out of order as a field error", () => {
    const result = toPolicy(
      firstCardForm({ perTx: "80", daily: "50", monthly: "200", askAbove: "" }),
      { token: "tusd.comatocard.testnet", decimals: 6 },
    );
    expect(result).toEqual({
      ok: false,
      field: "perTx",
      message: "Per payment can't exceed the day limit.",
    });
  });
});

describe("cardEnv", () => {
  it("writes the two lines an agent reads", () => {
    expect(cardEnv("a.factory.comatocard.testnet", "ed25519:abc")).toBe(
      "VAULT_ID=a.factory.comatocard.testnet\nCARD_PRIVATE_KEY=ed25519:abc\n",
    );
  });
});
