import { relayRequest } from "@comatocard/sdk";
import { RELAYER_URL, upstream } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

/** Same-origin proxy for `POST /relay`. The relayer itself checks the delegate and the sender. */
export async function POST(request: Request) {
  const body = relayRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json(
      { status: "refused", reason: "malformed", detail: "expected { signed_delegate }" },
      { status: 400 },
    );
  }
  try {
    const response = await fetch(upstream(RELAYER_URL, "relay"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body.data),
      signal: AbortSignal.timeout(30_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return Response.json({ error: "relayer unreachable" }, { status: 502 });
  }
}
