import { proposePolicy } from "@comatocard/agents/policy-assistant";
import { verifiedChat } from "@comatocard/agents/private-chat";
import { accountId, createVaultClient } from "@comatocard/sdk";
import { z } from "zod";
import { RPC_URL } from "@/lib/config";
import { clientKey, rateLimiter } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.strictObject({
  vault: accountId,
  cardId: z.number().int().nonnegative(),
  request: z.string().trim().min(3).max(500),
});

const allow = rateLimiter(6, 60_000);

/**
 * Policy assistant. A model in a TEE on NEAR AI Cloud proposes the card's new policy; the answer is
 * checked against the TEE's signature and attestation before it is returned. It never signs: the
 * owner signs `update_policy` in the wallet.
 */
export async function POST(request: Request) {
  const apiKey = process.env.NEAR_AI_API_KEY;
  if (!apiKey) return Response.json({ error: "The assistant is not configured." }, { status: 503 });
  if (!allow(clientKey(request))) {
    return Response.json({ error: "Too many requests, try again in a minute." }, { status: 429 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Describe the change in a few words." }, { status: 400 });
  const { vault, cardId } = parsed.data;

  const card = await createVaultClient({ rpcUrl: RPC_URL, vaultId: vault })
    .getCard(cardId)
    .catch(() => null);
  if (!card) return Response.json({ error: "No such card." }, { status: 404 });

  try {
    const proposal = await proposePolicy(
      {
        vaultId: vault,
        chat: (messages) =>
          verifiedChat(
            {
              baseUrl: process.env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1",
              apiKey,
              model: process.env.POLICY_MODEL || "Qwen/Qwen3.8-27B",
            },
            messages,
          ),
      },
      card,
      parsed.data.request,
    );
    return Response.json(proposal);
  } catch {
    return Response.json({ error: "NEAR AI Cloud did not answer. Try again." }, { status: 502 });
  }
}
