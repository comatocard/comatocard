import { accountId } from "@comatocard/sdk";
import { z } from "zod";
import { clientKey, rateLimiter } from "@/lib/server/rate-limit";
import { RELAYER_URL, upstream } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.strictObject({
  vault: accountId,
  cardId: z.number().int().nonnegative(),
  request: z.string().trim().min(3).max(500),
});

// A first, per-instance limit per visitor; the relayer holds the limit that protects the credits.
const allow = rateLimiter(6, 60_000);

/**
 * Same-origin proxy for the relayer's `POST /assistant`. The relayer holds the NEAR AI key, asks the
 * model in a TEE and checks its signature and attestation; this app never sees the key.
 */
export async function POST(request: Request) {
  if (!allow(clientKey(request))) {
    return Response.json({ error: "Too many requests, try again in a minute." }, { status: 429 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Describe the change in a few words." }, { status: 400 });
  try {
    const response = await fetch(upstream(RELAYER_URL, "assistant"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(110_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return Response.json({ error: "The assistant is not reachable." }, { status: 502 });
  }
}
