import { PassThrough } from "node:stream";
import type { RiskAssessment } from "@comatocard/sdk";
import { describe, expect, it } from "vitest";
import { askOnTerminal } from "../../src/approve.js";

const request = { merchant: "new.testnet", amount: "1000000" };
const risk: RiskAssessment = {
  account_id: "new.testnet",
  verdict: "warn",
  reasons: [{ code: "account_missing", level: "warn", detail: "the account does not exist" }],
  signals: {
    registry_status: "clear",
    report_count: 0,
    exists: false,
    is_contract: false,
    code_changed_at: null,
    prior_payments: null,
    first_paid_at: null,
  },
};

async function answer(write: (input: PassThrough) => void) {
  const input = new PassThrough();
  const output = new PassThrough();
  let shown = "";
  output.on("data", (chunk) => {
    shown += String(chunk);
  });
  const decision = askOnTerminal(request, risk, input, output);
  write(input);
  return { approved: await decision, shown };
}

describe("askOnTerminal", () => {
  it("shows the reasons and approves only on y", async () => {
    const yes = await answer((input) => input.write("Y\n"));
    expect(yes.approved).toBe(true);
    expect(yes.shown).toContain("warn account_missing: the account does not exist");
    expect((await answer((input) => input.write("\n"))).approved).toBe(false);
    expect((await answer((input) => input.write("yes please\n"))).approved).toBe(false);
  });

  it("declines when the prompt is aborted instead of crashing", async () => {
    expect((await answer((input) => input.end())).approved).toBe(false);
  });
});
