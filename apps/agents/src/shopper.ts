import { z } from "zod";
import type { Chat, ChatMessage, Tool } from "./llm.js";
import type { Logger } from "./logger.js";
import type { PaymentRequest } from "./spend.js";

const SYSTEM = `You are a purchasing agent with a Comatocard payment card.
Pay invoices with the pay tool. Amounts are in the smallest token unit: 1 tUSD is 1000000.
After paying, answer with one sentence describing what you paid.`;

const payTool: Tool = {
  type: "function",
  function: {
    name: "pay",
    description: "Pays a NEAR account from the agent's card.",
    parameters: {
      type: "object",
      properties: {
        merchant: { type: "string", description: "NEAR account to pay" },
        amount: { type: "string", description: "Amount in the smallest token unit" },
        reference: { type: "string", description: "Invoice reference" },
      },
      required: ["merchant", "amount"],
      additionalProperties: false,
    },
  },
};

const payArgs = z.object({
  merchant: z.string(),
  amount: z.string(),
  reference: z.string().max(64).optional(),
});

/** The agent's only capability; the result is shown to the model as the tool output. */
export type PayTool = (request: PaymentRequest) => Promise<unknown>;

/**
 * Runs the purchasing agent on `task` until it answers without a tool call or `maxSteps` model
 * turns pass. Everything the model asks for goes through `pay`, which owns every safety check.
 */
export async function runShopper(
  deps: { chat: Chat; pay: PayTool; logger: Pick<Logger, "info" | "warn"> },
  task: string,
  maxSteps = 5,
): Promise<string | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: task },
  ];
  for (let step = 0; step < maxSteps; step++) {
    const reply = await deps.chat(messages, [payTool]);
    messages.push(reply);
    if (!reply.tool_calls?.length) return reply.content ?? null;
    for (const call of reply.tool_calls) {
      const output = await runTool(deps, call.function.name, call.function.arguments);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) });
    }
  }
  deps.logger.warn({ maxSteps }, "agent stopped after the step limit");
  return null;
}

async function runTool(
  deps: { pay: PayTool; logger: Pick<Logger, "info" | "warn"> },
  name: string,
  rawArgs: string,
): Promise<unknown> {
  if (name !== "pay") return { error: `unknown tool ${name}` };
  let args: z.infer<typeof payArgs>;
  try {
    args = payArgs.parse(JSON.parse(rawArgs));
  } catch {
    return { error: "invalid arguments" };
  }
  deps.logger.info({ tool: "pay", args }, "agent requested a payment");
  try {
    return await deps.pay({
      merchant: args.merchant,
      amount: args.amount,
      ...(args.reference === undefined ? {} : { reference: args.reference }),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
