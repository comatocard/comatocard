import { createServer, type IncomingMessage, type Server } from "node:http";
import { type AssistantDeps, assistant } from "./assistant.js";
import { type RelayDeps, relay } from "./relay.js";

const MAX_BODY_BYTES = 16 * 1024;

/** `POST /relay`, `POST /assistant` and `GET /health`; any other route is 404. */
export function createRelayServer(
  deps: RelayDeps,
  assistantDeps: AssistantDeps | null = null,
): Server {
  return createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === "GET" && req.url === "/health") return reply(200, { status: "ok" });
      if (req.method === "POST" && req.url === "/assistant") {
        // Read before the body: an oversized body ends the stream and detaches the socket.
        const client = clientKey(req);
        const body = await readJson(req);
        const result = await assistant(assistantDeps, body ?? null, client);
        return reply(result.status, result.body);
      }
      if (req.method !== "POST" || req.url !== "/relay") return reply(404, { error: "not found" });
      const body = await readJson(req);
      if (body === undefined) {
        return reply(400, { status: "refused", reason: "malformed", detail: "invalid JSON body" });
      }
      const result = await relay(deps, body);
      return reply(result.status === "relayed" ? 200 : 400, result);
    } catch (error) {
      deps.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "relay error",
      );
      return reply(502, { error: "relay failed" });
    }
  });
}

/** The peer as the proxy in front reports it, else the socket address. */
function clientKey(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}
