import { z } from "zod";

/** NEAR Intents 1Click API; there is no testnet, so callers quote with `dry: true` there. */
export const ONECLICK_URL = "https://1click.chaindefuser.com/v0";

const quoteResponse = z.object({
  quote: z.object({
    amountIn: z.string(),
    amountInFormatted: z.string(),
    amountInUsd: z.string(),
    minAmountIn: z.string(),
    amountOut: z.string(),
    amountOutFormatted: z.string(),
    amountOutUsd: z.string(),
    minAmountOut: z.string(),
    timeEstimate: z.number(),
    depositAddress: z.string().optional(),
  }),
});

export type Quote = z.infer<typeof quoteResponse>["quote"];

export interface QuoteRequest {
  /** `nep141:<contract>` asset ids from `GET /tokens`. */
  originAsset: string;
  destinationAsset: string;
  /** Exact amount of the destination asset, in its smallest unit. */
  amountOut: string;
  slippageBps: number;
  /** Existing mainnet account that receives the output and any refund. */
  account: string;
  dry: boolean;
}

/** Asks 1Click for an `EXACT_OUTPUT` quote on NEAR. */
export async function quoteExactOutput(
  request: QuoteRequest,
  options: { baseUrl?: string; jwt?: string; fetch?: typeof globalThis.fetch } = {},
): Promise<Quote> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const response = await fetchFn(`${options.baseUrl ?? ONECLICK_URL}/quote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.jwt ? { authorization: `Bearer ${options.jwt}` } : {}),
    },
    body: JSON.stringify({
      dry: request.dry,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: request.slippageBps,
      originAsset: request.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: request.destinationAsset,
      amount: request.amountOut,
      refundTo: request.account,
      refundType: "ORIGIN_CHAIN",
      recipient: request.account,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // 1Click answers 500 for an account that does not exist on mainnet.
    throw new Error(`1click quote: ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  const parsed = quoteResponse.safeParse(await response.json());
  if (!parsed.success)
    throw new Error(`1click quote: unexpected response\n${z.prettifyError(parsed.error)}`);
  return parsed.data.quote;
}
