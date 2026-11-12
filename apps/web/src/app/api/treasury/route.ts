import { quoteExactOutput } from "@comatocard/agents/oneclick";
import { planTreasury } from "@comatocard/agents/treasury";
import { accountId, createVaultClient } from "@comatocard/sdk";
import { RPC_URL, TOKEN_ID } from "@/lib/config";
import { clientKey, rateLimiter } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const allow = rateLimiter(10, 60_000);
// Mainnet USDC on NEAR, quoted for the testnet token (NEAR Intents has no testnet, Q-007).
const USDC = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

/**
 * Treasury dry run: compares what the cards may still spend with the vault balance and, when short,
 * quotes the deficit through NEAR Intents 1Click. Nothing is signed or sent.
 */
export async function GET(request: Request) {
  const account = process.env.TREASURY_ACCOUNT;
  if (!account) return Response.json({ error: "The treasury is not configured." }, { status: 503 });
  if (!allow(clientKey(request))) {
    return Response.json({ error: "Too many requests, try again in a minute." }, { status: 429 });
  }
  const vault = accountId.safeParse(new URL(request.url).searchParams.get("vault"));
  if (!vault.success) return Response.json({ error: "Name a card account." }, { status: 400 });
  const client = createVaultClient({ rpcUrl: RPC_URL, vaultId: vault.data });
  const jwt = process.env.ONECLICK_JWT;
  try {
    const plan = await planTreasury(
      {
        cards: () => client.listCards({ limit: 100 }),
        balances: () => client.getBalances(),
        quote: (req) => quoteExactOutput(req, jwt ? { jwt } : {}),
        nowNs: () => BigInt(Date.now()) * 1_000_000n,
      },
      {
        token: TOKEN_ID,
        destinationAsset: USDC,
        originAsset: process.env.TREASURY_ORIGIN_ASSET || "nep141:wrap.near",
        slippageBps: Number(process.env.TREASURY_SLIPPAGE_BPS || 100),
        maxSwapUsd: Number(process.env.TREASURY_MAX_SWAP_USD || 20),
        account,
      },
    );
    return Response.json(plan);
  } catch {
    return Response.json({ error: "The 1Click quote is not available." }, { status: 502 });
  }
}
