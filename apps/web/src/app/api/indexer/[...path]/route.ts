import { isIndexerRoute } from "@/lib/server/indexer-path";
import { INDEXER_URL, upstream } from "@/lib/server/upstream";

export const dynamic = "force-dynamic";

/** Same-origin proxy for the indexer's read API, which sends no CORS headers. */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  if (!isIndexerRoute(path)) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const response = await fetch(upstream(INDEXER_URL, path, new URL(request.url).search), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const headers = new Headers({
      "content-type": response.headers.get("content-type") ?? "application/json",
    });
    const disposition = response.headers.get("content-disposition");
    if (disposition) headers.set("content-disposition", disposition);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ error: "indexer unreachable" }, { status: 502 });
  }
}
