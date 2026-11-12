import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface Recorded {
  method: string;
  url: string;
  body: string;
}

export type Handler = (req: Recorded) => { status: number; body: unknown };

/** A real HTTP server on a free port that records requests and answers with `handler`. */
export async function startUpstream(handler: Handler) {
  const requests: Recorded[] = [];
  const read = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  };
  const server: Server = createServer(async (req, res) => {
    const recorded = { method: req.method ?? "", url: req.url ?? "", body: await read(req) };
    requests.push(recorded);
    const { status, body } = handler(recorded);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
