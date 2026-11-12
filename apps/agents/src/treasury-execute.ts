import type { Quote, QuoteRequest, SwapStatus } from "./oneclick.js";
import { TERMINAL_STATUSES } from "./oneclick.js";
import { quoteRefusal, type TreasuryConfig } from "./treasury.js";

export const WRAP_NEAR = "wrap.near";
/** `storage_balance_bounds().min` of wrap.near; refunded when the account is registered already. */
const STORAGE_DEPOSIT = 1_250_000_000_000_000_000_000n;
const TGAS = 1_000_000_000_000n;

export interface DepositCall {
  methodName: string;
  args: Record<string, unknown>;
  gas: bigint;
  deposit: bigint;
}

/**
 * One transaction to wrap.near: register both accounts (the 1Click deposit address is a fresh
 * implicit account that wrap.near does not know), wrap `amountIn` NEAR and send it to 1Click.
 */
export function depositCalls(
  sender: string,
  depositAddress: string,
  amountIn: bigint,
): DepositCall[] {
  const register = (account: string): DepositCall => ({
    methodName: "storage_deposit",
    args: { account_id: account, registration_only: true },
    gas: 10n * TGAS,
    deposit: STORAGE_DEPOSIT,
  });
  return [
    register(sender),
    register(depositAddress),
    { methodName: "near_deposit", args: {}, gas: 10n * TGAS, deposit: amountIn },
    {
      methodName: "ft_transfer",
      args: { receiver_id: depositAddress, amount: amountIn.toString() },
      gas: 30n * TGAS,
      deposit: 1n,
    },
  ];
}

export interface ExecuteDeps {
  quote: (request: QuoteRequest) => Promise<Quote>;
  /** Signs and sends `calls` to wrap.near as the treasury account; resolves to the tx hash. */
  send: (calls: DepositCall[]) => Promise<string>;
  submit: (txHash: string, depositAddress: string) => Promise<void>;
  status: (depositAddress: string) => Promise<SwapStatus>;
  sleep: (ms: number) => Promise<void>;
}

export interface Execution {
  status: SwapStatus["status"] | "TIMEOUT";
  depositAddress: string;
  txHash: string;
  amountIn: string;
  amountOut?: string | null;
  destinationTxHashes: string[];
  refundReason?: string | null;
}

/**
 * Commits a fresh quote for `deficit`, applies the same refusals as the plan, sends the deposit
 * and polls 1Click until the swap reaches a terminal status or `timeoutMs` passes.
 */
export async function executeTopUp(
  deps: ExecuteDeps,
  config: TreasuryConfig,
  deficit: bigint,
  timing: { pollMs: number; timeoutMs: number } = { pollMs: 3_000, timeoutMs: 600_000 },
): Promise<Execution> {
  if (config.originAsset !== `nep141:${WRAP_NEAR}`) {
    throw new Error(`execute pays with NEAR, origin asset must be nep141:${WRAP_NEAR}`);
  }
  const quote = await deps.quote({
    originAsset: config.originAsset,
    destinationAsset: config.destinationAsset,
    amountOut: deficit.toString(),
    slippageBps: config.slippageBps,
    account: config.account,
    dry: false,
  });
  const refusal = quoteRefusal(quote, deficit, config.maxSwapUsd);
  if (refusal) throw new Error(`committed quote refused: ${refusal}`);
  const depositAddress = quote.depositAddress;
  if (!depositAddress) throw new Error("committed quote has no deposit address");

  const amountIn = BigInt(quote.amountIn);
  const txHash = await deps.send(depositCalls(config.account, depositAddress, amountIn));
  await deps.submit(txHash, depositAddress);

  const base = { depositAddress, txHash, amountIn: amountIn.toString() };
  const terminal: readonly string[] = TERMINAL_STATUSES;
  for (let waited = 0; waited <= timing.timeoutMs; waited += timing.pollMs) {
    const swap = await deps.status(depositAddress);
    if (terminal.includes(swap.status)) {
      return {
        ...base,
        status: swap.status,
        amountOut: swap.swapDetails?.amountOut ?? null,
        destinationTxHashes: (swap.swapDetails?.destinationChainTxHashes ?? []).map((t) => t.hash),
        refundReason: swap.swapDetails?.refundReason ?? null,
      };
    }
    await deps.sleep(timing.pollMs);
  }
  return { ...base, status: "TIMEOUT", destinationTxHashes: [] };
}
