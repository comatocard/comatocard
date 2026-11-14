import { createServer, type IncomingMessage, type Server } from "node:http";
import { type AssistantDeps, assistant } from "./assistant.js";
import { type RelayDeps, relay } from "./relay.js";

const MAX_BODY_BYTES = 16 * 1024;

type Reply = { status: number; body: unknown };

/**
 * One service: `POST <path>` handled by `handle`, `GET /health`, anything else 404. The relayer
 * and the policy assistant run as separate services so the gas key and the NEAR AI key never
 * share a process (#188).
 */
function service(
  path: string,
  handle: (body: unknown, client: string) => Promise<Reply>,
  logger: { warn: (obj: object, msg: string) => void },
): Server {
  return createServer(async (req, res) => {
    const reply = ({ status, body }: Reply) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === "GET" && req.url === "/health") {
        return reply({ status: 200, body: { status: "ok" } });
      }
      if (req.method !== "POST" || req.url !== path) {
        return reply({ status: 404, body: { error: "not found" } });
      }
      // Read before the body: an oversized body ends the stream and detaches the socket.
      const client = clientKey(req);
      return reply(await handle(await readJson(req), client));
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        `${path} error`,
      );
      return reply({ status: 502, body: { error: `${path.slice(1)} failed` } });
    }
  });
}

/** The relayer: `POST /relay` and `GET /health`. It holds the gas key and no NEAR AI key. */
export function createRelayServer(deps: RelayDeps): Server {
  return service(
    "/relay",
    async (body) => {
      if (body === undefined) {
        return {
          status: 400,
          body: { status: "refused", reason: "malformed", detail: "invalid JSON body" },
        };
      }
      const result = await relay(deps, body);
      return { status: result.status === "relayed" ? 200 : 400, body: result };
    },
    deps.logger,
  );
}

/** The policy assistant: `POST /assistant` and `GET /health`. It holds the NEAR AI key only. */
export function createAssistantServer(deps: AssistantDeps): Server {
  return service(
    "/assistant",
    (body, client) => assistant(deps, body ?? null, client),
    deps.logger,
  );
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
