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

interface Options {
  baseUrl?: string;
  jwt?: string;
  fetch?: typeof globalThis.fetch;
}

async function request(path: string, init: RequestInit, options: Options): Promise<unknown> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const response = await fetchFn(`${options.baseUrl ?? ONECLICK_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(options.jwt ? { authorization: `Bearer ${options.jwt}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const name = path.slice(1).split("?")[0];
  if (!response.ok) {
    // 1Click answers 500 for an account that does not exist on mainnet.
    throw new Error(`1click ${name}: ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}

function parse<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new Error(`1click ${name}: unexpected response\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** Asks 1Click for an `EXACT_OUTPUT` quote on NEAR. With `dry: false` it has a deposit address. */
export async function quoteExactOutput(
  request_: QuoteRequest,
  options: Options = {},
): Promise<Quote> {
  const body = await request(
    "/quote",
    {
      method: "POST",
      body: JSON.stringify({
        dry: request_.dry,
        swapType: "EXACT_OUTPUT",
        slippageTolerance: request_.slippageBps,
        originAsset: request_.originAsset,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: request_.destinationAsset,
        amount: request_.amountOut,
        refundTo: request_.account,
        refundType: "ORIGIN_CHAIN",
        recipient: request_.account,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    },
    options,
  );
  return parse(quoteResponse, body, "quote").quote;
}

/** Tells 1Click about the deposit transaction so it does not wait to discover it. */
export async function submitDeposit(
  deposit: { txHash: string; depositAddress: string; nearSenderAccount: string },
  options: Options = {},
): Promise<void> {
  await request("/deposit/submit", { method: "POST", body: JSON.stringify(deposit) }, options);
}

export const TERMINAL_STATUSES = ["SUCCESS", "INCOMPLETE_DEPOSIT", "REFUNDED", "FAILED"] as const;

const swapStatus = z.object({
  status: z.enum(["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", ...TERMINAL_STATUSES]),
  swapDetails: z
    .object({
      amountOut: z.string().nullish(),
      destinationChainTxHashes: z.array(z.object({ hash: z.string() })).nullish(),
      refundReason: z.string().nullish(),
    })
    .nullish(),
});

export type SwapStatus = z.infer<typeof swapStatus>;

/** Reads the execution status of the swap behind `depositAddress`. */
export async function getSwapStatus(
  depositAddress: string,
  options: Options = {},
): Promise<SwapStatus> {
  const query = new URLSearchParams({ depositAddress });
  const body = await request(`/status?${query}`, { method: "GET" }, options);
  return parse(swapStatus, body, "status");
}
