import type { PaymentPreview, RiskAssessment, VaultClient } from "@comatocard/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createMcpServer, type ToolDeps } from "../../src/mcp-tools.js";
import type { Submit } from "../../src/spend.js";

const vaultId = "alice.factory.comatocard.testnet";
const publicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp";

const risk = (verdict: RiskAssessment["verdict"]): RiskAssessment => ({
  account_id: "shop.testnet",
  verdict,
  reasons: verdict === "allow" ? [] : [{ code: "registry_flagged", level: verdict, detail: "x" }],
  signals: {
    registry_status: verdict === "allow" ? "clear" : "flagged",
    report_count: 0,
    exists: true,
    is_contract: false,
    code_changed_at: null,
    prior_payments: 0,
    first_paid_at: null,
  },
});

async function connect(verdict: RiskAssessment["verdict"], fetch?: typeof globalThis.fetch) {
  const submit = vi.fn<Submit>(async () => ({
    txHash: "tx1",
    result: { status: "submitted", payment_id: 3 },
  }));
  const preview: PaymentPreview = { status: "allowed" } as PaymentPreview;
  const client = {
    vaultId,
    previewPayment: vi.fn(async () => preview),
    getConfig: vi.fn(async () => ({ owner_id: "alice.testnet" })),
    getCardByKey: vi.fn(async () => ({ id: 0, label: "agent" })),
  } as unknown as VaultClient;
  const deps: ToolDeps = {
    client,
    publicKey,
    indexerUrl: "https://indexer.example",
    risk: async () => risk(verdict),
    submit,
    logger: { info: vi.fn(), warn: vi.fn() },
    ...(fetch === undefined ? {} : { fetch }),
  };
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(deps, "test").connect(serverSide);
  const mcp = new Client({ name: "test", version: "test" });
  await mcp.connect(clientSide);
  return { mcp, submit };
}

const body = (result: Awaited<ReturnType<Client["callTool"]>>) =>
  JSON.parse((result.content as { text: string }[])[0]?.text ?? "null");

describe("mcp tools", () => {
  it("lists the card tools, with only pay marked destructive", async () => {
    const { mcp } = await connect("allow");
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "card_status",
      "check_merchant",
      "pay",
      "payment_history",
      "preview_payment",
    ]);
    expect(tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name)).toEqual(["pay"]);
  });

  it("pays through the guard on an allow verdict", async () => {
    const { mcp, submit } = await connect("allow");
    const result = await mcp.callTool({
      name: "pay",
      arguments: { merchant: "shop.testnet", amount: "1000000", reference: "shop-1" },
    });
    expect(result.isError).toBeFalsy();
    expect(body(result)).toMatchObject({ kind: "sent", txHash: "tx1" });
    expect(submit).toHaveBeenCalledOnce();
  });

  it("refuses a warn verdict without signing, since no human can confirm", async () => {
    const { mcp, submit } = await connect("warn");
    const result = await mcp.callTool({
      name: "pay",
      arguments: { merchant: "shop.testnet", amount: "1000000" },
    });
    expect(result.isError).toBe(true);
    expect(body(result)).toMatchObject({ kind: "refused", by: "human" });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects an invalid amount before the guard runs", async () => {
    const { mcp, submit } = await connect("allow");
    const result = await mcp.callTool({
      name: "pay",
      arguments: { merchant: "shop.testnet", amount: "-1" },
    });
    expect(result.isError).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it("reads the card payment history from the indexer", async () => {
    const fetch = vi.fn(async (url: URL | string) => {
      expect(String(url)).toBe(`https://indexer.example/vaults/${vaultId}/payments?card=0&limit=5`);
      return Response.json({ items: [], next_cursor: null });
    });
    const { mcp } = await connect("allow", fetch as unknown as typeof globalThis.fetch);
    const result = await mcp.callTool({ name: "payment_history", arguments: { limit: 5 } });
    expect(body(result)).toEqual({ items: [], next_cursor: null });
  });
});
