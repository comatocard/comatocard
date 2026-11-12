import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RelayDeps } from "../../src/relay.js";
import { createRelayServer } from "../../src/server.js";
import { FACTORY, OWNER, signedDelegate } from "./support.js";

const deps: RelayDeps = {
  factoryId: FACTORY,
  logger: { info: vi.fn(), warn: vi.fn() },
  vault: async () => ({
    config: {
      owner: OWNER,
      pending_owner: null,
      factory: FACTORY,
      registry: null,
      approval_ttl: "1",
      contract_version: "0.4.0",
    },
    approvers: [],
  }),
  risk: async () => {
    throw new Error("not used");
  },
  send: async () => ({ txHash: "tx1", failure: null }),
};

let close: (() => void) | undefined;
afterEach(() => close?.());

async function start(d: RelayDeps = deps) {
  const server = createRelayServer(d);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close = () => server.close();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const post = (url: string, body: string) =>
  fetch(`${url}/relay`, { method: "POST", headers: { "content-type": "application/json" }, body });

describe("relay server", () => {
  it("serves health and 404", async () => {
    const url = await start();
    expect(await (await fetch(`${url}/health`)).json()).toEqual({ status: "ok" });
    expect((await fetch(`${url}/relay`)).status).toBe(404);
  });

  it("answers 200 when relayed and 400 when refused", async () => {
    const url = await start();
    const ok = await post(url, JSON.stringify({ signed_delegate: await signedDelegate({}) }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: "relayed", tx_hash: "tx1", failure: null });
    const refused = await post(
      url,
      JSON.stringify({ signed_delegate: await signedDelegate({ sender: "x.testnet" }) }),
    );
    expect(refused.status).toBe(400);
  });

  it("refuses invalid JSON and oversized bodies", async () => {
    const url = await start();
    expect((await post(url, "{not json")).status).toBe(400);
    expect((await post(url, JSON.stringify({ signed_delegate: "A".repeat(20_000) }))).status).toBe(
      400,
    );
  });

  it("answers 502 when sending fails", async () => {
    const url = await start({
      ...deps,
      send: async () => {
        throw new Error("rpc down");
      },
    });
    expect(
      (await post(url, JSON.stringify({ signed_delegate: await signedDelegate({}) }))).status,
    ).toBe(502);
  });
});
