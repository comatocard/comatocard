import { type Proposal, proposePolicy } from "@comatocard/agents/policy-assistant";
import { verifiedChat } from "@comatocard/agents/private-chat";
import { accountId, type Card, createVaultClient } from "@comatocard/sdk";
import { z } from "zod";
import type { NearAiConfig } from "./config.js";
import { rateLimiter } from "./rate-limit.js";

/** Model calls cost NEAR AI credits: a few per client a minute, and a cap for the whole relayer. */
export const ASSISTANT_LIMITS = { perClient: 10, overall: 30, windowMs: 60_000 } as const;

export const assistantRequest = z.strictObject({
  vault: accountId,
  cardId: z.number().int().nonnegative(),
  request: z.string().trim().min(3).max(500),
});

export interface AssistantDeps {
  factoryId: string;
  /** False once the client or the whole relayer used up its share of model calls. */
  allow: (clientKey: string) => boolean;
  card: (vaultId: string, cardId: number) => Promise<Card | null>;
  /** Asks the model in a TEE on NEAR AI Cloud and checks its signature and attestation. */
  propose: (vaultId: string, card: Card, request: string) => Promise<Proposal>;
  logger: { warn: (obj: object, msg: string) => void };
}

export interface AssistantReply {
  status: number;
  body: Proposal | { error: string };
}

const fail = (status: number, error: string): AssistantReply => ({ status, body: { error } });

/**
 * Policy assistant: proposes a card's new policy. It never signs; the owner signs `update_policy`
 * in the wallet. `deps` is null when no NEAR AI key is configured.
 */
export async function assistant(
  deps: AssistantDeps | null,
  body: unknown,
  clientKey: string,
): Promise<AssistantReply> {
  if (deps === null) return fail(503, "The assistant is not configured.");
  if (!deps.allow(clientKey)) return fail(429, "Too many requests, try again in a minute.");
  const parsed = assistantRequest.safeParse(body);
  if (!parsed.success) return fail(400, "Describe the change in a few words.");
  const { vault, cardId, request } = parsed.data;
  if (!isFactoryVault(vault, deps.factoryId)) return fail(404, "No such card.");

  const card = await deps.card(vault, cardId).catch(() => null);
  if (!card) return fail(404, "No such card.");
  try {
    return { status: 200, body: await deps.propose(vault, card, request) };
  } catch (error) {
    deps.logger.warn(
      { vault, cardId, error: error instanceof Error ? error.message : String(error) },
      "assistant failed",
    );
    return fail(502, "NEAR AI Cloud did not answer. Try again.");
  }
}

function isFactoryVault(vault: string, factoryId: string): boolean {
  const name = vault.slice(0, -(factoryId.length + 1));
  return vault.endsWith(`.${factoryId}`) && name.length > 0 && !name.includes(".");
}

/** The assistant wired to the vault on chain and the model on NEAR AI Cloud. */
export function createAssistantDeps(options: {
  factoryId: string;
  rpcUrl: string;
  nearAi: NearAiConfig;
  logger: AssistantDeps["logger"];
  /** Injectable for recorded tests; defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  nonce?: () => string;
}): AssistantDeps {
  const { perClient, overall, windowMs } = ASSISTANT_LIMITS;
  const client = rateLimiter(perClient, windowMs);
  const total = rateLimiter(overall, windowMs);
  const io = options.fetch === undefined ? {} : { fetch: options.fetch };
  const chat = {
    ...options.nearAi,
    ...io,
    ...(options.nonce === undefined ? {} : { nonce: options.nonce }),
  };
  return {
    factoryId: options.factoryId,
    logger: options.logger,
    allow: (key) => client(key) && total("all"),
    card: (vaultId, cardId) =>
      createVaultClient({ rpcUrl: options.rpcUrl, vaultId, ...io }).getCard(cardId),
    propose: (vaultId, card, request) =>
      proposePolicy({ vaultId, chat: (messages) => verifiedChat(chat, messages) }, card, request),
  };
}
