import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createAssistantDeps } from "../../src/assistant.js";
import { createAssistantServer } from "../../src/server.js";
import { card, VAULT } from "../unit/assistant-support.js";
import { FACTORY } from "../unit/support.js";

// The assistant service runs as a real HTTP server with the production wiring: the card is read
// over JSON-RPC from a stand-in node, and NEAR AI Cloud is a stand-in that replays a recorded
// completion, its signature and the TDX attestation report.

const fixture = JSON.parse(
  readFileSync(new URL("../../../agents/test/fixtures/near-ai-qwen.json", import.meta.url), "utf8"),
);

type Handler = (url: string, body: string) => { status: number; body: string };

async function serve(handler: Handler) {
  const seen: { url: string; body: string; auth: string | undefined }[] = [];
  const read = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  };
  const server: Server = createServer(async (req, res) => {
    const body = await read(req);
    seen.push({ url: req.url ?? "", body, auth: req.headers.authorization });
    const answer = handler(req.url ?? "", body);
    res.writeHead(answer.status, { "content-type": "application/json" });
    res.end(answer.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    seen,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const rpc = await serve((_url, body) => {
  const { params } = JSON.parse(body) as { params: { method_name: string } };
  const value = params.method_name === "get_card" ? card : null;
  const bytes = [...new TextEncoder().encode(JSON.stringify(value))];
  return {
    status: 200,
    body: JSON.stringify({ jsonrpc: "2.0", id: "x", result: { result: bytes } }),
  };
});

const nearAi = await serve((url) => {
  if (url.endsWith("/chat/completions"))
    return { status: 200, body: fixture.completion.responseBody };
  if (url.includes("/signature/")) return { status: 200, body: JSON.stringify(fixture.signature) };
  if (url.includes("/attestation/report"))
    return { status: 200, body: JSON.stringify(fixture.report) };
  return { status: 404, body: "{}" };
});

const server = createAssistantServer(
  createAssistantDeps({
    factoryId: FACTORY,
    rpcUrl: rpc.url,
    nearAi: { baseUrl: `${nearAi.url}/v1`, apiKey: "test-key", model: "Qwen/Qwen3.8-27B" },
    logger: { warn: vi.fn() },
    nonce: () => fixture.nonce,
  }),
);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const relayer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.all([rpc.close(), nearAi.close()]);
});

const ask = (client: string) =>
  fetch(`${relayer}/assistant`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": client },
    body: JSON.stringify({ vault: VAULT, cardId: 0, request: "raise the daily limit to 80 tUSD" }),
  });

describe("relayer POST /assistant", () => {
  it("reads the card on chain, asks NEAR AI Cloud with the key and returns the verified answer", async () => {
    const response = await ask("198.51.100.1");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { answer: string; verification: unknown };
    // The recorded completion answers "ok", which holds no policy, so the proposal is refused
    // while the TEE checks of the answer still come back.
    expect(body).toMatchObject({ kind: "invalid", cardId: 0 });
    expect(body.answer.trim()).toBe("ok");
    expect(body.verification).toMatchObject({
      signingAddress: fixture.signature.signing_address,
      responseSigned: true,
      reportFound: true,
    });

    const view = JSON.parse(rpc.seen.at(-1)?.body ?? "{}");
    expect(view.params).toMatchObject({ account_id: VAULT, method_name: "get_card" });
    const completion = nearAi.seen.find((r) => r.url.endsWith("/chat/completions"));
    expect(completion?.auth).toBe("Bearer test-key");
    expect(JSON.parse(completion?.body ?? "{}").messages.at(-1).content).toContain(
      "raise the daily limit to 80 tUSD",
    );
  });

  it("limits one client to 10 model calls a minute without blocking another", async () => {
    const before = nearAi.seen.length;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await ask("198.51.100.2")).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect((await ask("198.51.100.3")).status).toBe(200);
    // The refused call never reached NEAR AI Cloud.
    const completions = nearAi.seen
      .slice(before)
      .filter((r) => r.url.endsWith("/chat/completions"));
    expect(completions).toHaveLength(11);
  });
});
