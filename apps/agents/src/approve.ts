import { createInterface } from "node:readline/promises";
import type { RiskAssessment } from "@comatocard/sdk";
import type { PaymentRequest } from "./spend.js";

/** Asks a human whether to pay despite a `warn` verdict. */
export type Approve = (request: PaymentRequest, risk: RiskAssessment) => Promise<boolean>;

/**
 * Prompts on the terminal. Declines without a terminal, since nobody can answer, and when the
 * prompt is aborted with Ctrl+C, Ctrl+D or a closed input.
 */
export const terminalApproval: Approve = (request, risk) =>
  process.stdin.isTTY
    ? askOnTerminal(request, risk, process.stdin, process.stderr)
    : Promise.resolve(false);

export async function askOnTerminal(
  request: PaymentRequest,
  risk: RiskAssessment,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<boolean> {
  const reasons = risk.reasons.map((r) => `  ${r.level} ${r.code}: ${r.detail}`).join("\n");
  const prompt = createInterface({ input, output });
  // A closed input (EOF, Ctrl+D) would otherwise leave the question pending forever.
  const closed = new AbortController();
  prompt.once("close", () => closed.abort());
  try {
    const answer = await prompt.question(
      `Indexer warns about ${request.merchant}:\n${reasons}\nPay ${request.amount} anyway? [y/N] `,
      { signal: closed.signal },
    );
    return answer.trim().toLowerCase() === "y";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return false;
    throw error;
  } finally {
    prompt.close();
  }
}
