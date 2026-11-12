import { describe, expect, it, vi } from "vitest";
import { quoteExactOutput } from "../../src/oneclick.js";

const request = {
  originAsset: "nep141:wrap.near",
  destinationAsset: "nep141:usdc",
  amountOut: "5000000",
  slippageBps: 100,
  account: "treasury.near",
  dry: true,
};

const body = {
  quote: {
    amountIn: "1450293071742473121016661",
    amountInFormatted: "1.45",
    amountInUsd: "5.06",
    minAmountIn: "1435802641025048389806494",
    amountOut: "5000000",
    amountOutFormatted: "5.0",
    amountOutUsd: "4.99",
    minAmountOut: "5000000",
    timeEstimate: 22,
  },
};

describe("quoteExactOutput", () => {
  it("sends an EXACT_OUTPUT dry quote for NEAR accounts with the JWT", async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(body)),
    );
    await expect(quoteExactOutput(request, { fetch, jwt: "t" })).resolves.toEqual(body.quote);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://1click.chaindefuser.com/v0/quote");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer t");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      dry: true,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: 100,
      amount: "5000000",
      recipient: "treasury.near",
      refundTo: "treasury.near",
      recipientType: "DESTINATION_CHAIN",
    });
  });

  it("throws on errors and unexpected bodies", async () => {
    const failing = async () => new Response("Internal server error", { status: 500 });
    await expect(quoteExactOutput(request, { fetch: failing })).rejects.toThrow(
      "1click quote: 500",
    );
    const odd = async () => new Response(JSON.stringify({ quote: {} }));
    await expect(quoteExactOutput(request, { fetch: odd })).rejects.toThrow("unexpected response");
  });
});
