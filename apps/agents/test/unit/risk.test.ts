import { describe, expect, it, vi } from "vitest";
import { indexerRisk } from "../../src/risk.js";

const assessment = {
  account_id: "shop.testnet",
  verdict: "allow",
  reasons: [],
  signals: {
    registry_status: "clear",
    report_count: 0,
    exists: true,
    is_contract: false,
    code_changed_at: null,
    prior_payments: 2,
    first_paid_at: "1",
  },
};

const responding = (body: unknown, status = 200) =>
  vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify(body), { status }));

describe("indexerRisk", () => {
  it("asks for the merchant with the vault and parses the verdict", async () => {
    const fetch = responding(assessment);
    const risk = indexerRisk({
      indexerUrl: "https://idx.example/api/",
      vaultId: "v.testnet",
      fetch,
    });
    await expect(risk("shop.testnet")).resolves.toEqual(assessment);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "https://idx.example/api/risk/shop.testnet?vault=v.testnet",
    );
  });

  it("throws on an HTTP error or an unexpected body", async () => {
    const down = indexerRisk({
      indexerUrl: "https://x",
      vaultId: "v.testnet",
      fetch: responding({}, 503),
    });
    await expect(down("shop.testnet")).rejects.toThrow("indexer responded 503");
    const odd = indexerRisk({
      indexerUrl: "https://x",
      vaultId: "v.testnet",
      fetch: responding({ ...assessment, verdict: "fine" }),
    });
    await expect(odd("shop.testnet")).rejects.toThrow("unexpected response");
  });
});
