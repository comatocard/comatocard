import { accountId } from "@comatocard/sdk";
import { z } from "zod";

/** Public configuration, inlined at build time. Every value has the testnet deployment as default. */
const network = z.enum(["testnet", "mainnet"]).parse(process.env.NEXT_PUBLIC_NETWORK || "testnet");

// FastNEAR, listed in docs.near.org/api/rpc/providers. rpc.testnet.near.org refused browser
// requests under load while testing (fetch failed, no CORS headers on the error).
const DEFAULT_RPC = {
  testnet: "https://test.rpc.fastnear.com",
  mainnet: "https://free.rpc.fastnear.com",
} as const;

export const NETWORK = network;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC[network];
export const FACTORY_ID = accountId.parse(
  process.env.NEXT_PUBLIC_FACTORY_ID || "factory.comatocard.testnet",
);
export const TOKEN_ID = accountId.parse(
  process.env.NEXT_PUBLIC_TOKEN_ID || "tusd.comatocard.testnet",
);
/** WebSocket base of the indexer, opened by the browser for the live feed. */
export const INDEXER_WS_URL = process.env.NEXT_PUBLIC_INDEXER_WS_URL || "ws://localhost:4000";
export const EXPLORER_URL =
  network === "testnet" ? "https://testnet.nearblocks.io" : "https://nearblocks.io";

export const txUrl = (hash: string) => `${EXPLORER_URL}/txns/${hash}`;
export const accountUrl = (account: string) => `${EXPLORER_URL}/address/${account}`;
