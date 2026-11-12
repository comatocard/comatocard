import { type Card, type FunctionCall, type Policy, policy, vaultCalls } from "@comatocard/sdk";
import { z } from "zod";
import type { Verification } from "./private-chat.js";

const SYSTEM = `You edit Comatocard card policies. Reply with only the complete new policy as one JSON object,
no prose. Keep every field of the current policy and change only what the owner asks for.
Amounts are strings in the token's smallest unit: 1 tUSD is "1000000".
Fields: token, per_tx_limit, daily_limit, monthly_limit, approval_threshold (string or null),
merchants ("any", {"allow": [accounts]} or {"deny": [accounts]}), valid_from and expires_at
(nanosecond timestamps as strings, or null), risk_mode ("off", "block_only" or "strict").
per_tx_limit must not exceed daily_limit, and daily_limit must not exceed monthly_limit.`;

export type Chat = (
  messages: { role: "system" | "user"; content: string }[],
) => Promise<{ content: string; verification: Verification }>;

export type Proposal =
  | {
      kind: "proposal";
      cardId: number;
      current: Policy;
      proposed: Policy;
      changed: string[];
      call: FunctionCall;
      verification: Verification;
    }
  | { kind: "invalid"; cardId: number; reason: string; answer: string; verification: Verification };

/** Asks the model for a new policy and turns it into an `update_policy` call for the owner to sign. */
export async function proposePolicy(
  deps: { chat: Chat; vaultId: string },
  card: Card,
  request: string,
): Promise<Proposal> {
  const { content, verification } = await deps.chat([
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Current policy of card ${card.id} ("${card.label}"):\n${JSON.stringify(card.policy)}\n\nOwner request: ${request}`,
    },
  ]);
  const invalid = (reason: string): Proposal => ({
    kind: "invalid",
    cardId: card.id,
    reason,
    answer: content,
    verification,
  });
  const json = extractJson(content);
  if (json === undefined) return invalid("the answer holds no JSON object");
  const parsed = policy.safeParse(json);
  if (!parsed.success) return invalid(`not a valid policy: ${z.prettifyError(parsed.error)}`);
  const proposed = parsed.data;
  if (proposed.token !== card.policy.token)
    return invalid("the assistant may not change the card token");
  const limits = [proposed.per_tx_limit, proposed.daily_limit, proposed.monthly_limit].map(BigInt);
  if ((limits[0] ?? 0n) > (limits[1] ?? 0n) || (limits[1] ?? 0n) > (limits[2] ?? 0n)) {
    return invalid("per_tx_limit <= daily_limit <= monthly_limit does not hold");
  }
  const changed = (Object.keys(proposed) as (keyof Policy)[]).filter(
    (key) => JSON.stringify(proposed[key]) !== JSON.stringify(card.policy[key]),
  );
  return {
    kind: "proposal",
    cardId: card.id,
    current: card.policy,
    proposed,
    changed,
    call: vaultCalls(deps.vaultId).updatePolicy(card.id, proposed),
    verification,
  };
}

/**
 * The first balanced JSON object in a model answer, which may wrap it in prose or a code fence.
 * Reasoning before a closing `</think>` is skipped.
 */
export function extractJson(answer: string): unknown {
  const thinkEnd = answer.lastIndexOf("</think>");
  const text = thinkEnd < 0 ? answer : answer.slice(thinkEnd + "</think>".length);
  const start = text.indexOf("{");
  if (start < 0) return undefined;
  const end = closingBrace(text, start);
  if (end < 0) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** Index of the brace closing the object that opens at `start`, skipping strings; -1 if none. */
function closingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}
