import { accountId } from "@comatocard/sdk";
import { KeyPair, type KeyPairString } from "near-api-js";
import { z } from "zod";

const RPC_URLS = {
  testnet: "https://rpc.testnet.near.org",
  mainnet: "https://rpc.mainnet.near.org",
} as const;

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const schema = z.object({
  NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  RPC_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  VAULT_ID: accountId,
  INDEXER_URL: z.url().default("http://localhost:4000"),
  CARD_PRIVATE_KEY: z.string().startsWith("ed25519:", "must be an ed25519:<base58> secret key"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export interface Config {
  network: "testnet" | "mainnet";
  rpcUrl: string;
  vaultId: string;
  /** Indexer the guard asks for counterparty risk. */
  indexerUrl: string;
  /** Holds the secret; never pass it to a logger. */
  cardKey: KeyPair;
  logLevel: z.infer<typeof schema>["LOG_LEVEL"];
}

/** Reads and validates the configuration from environment variables. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Zod messages never echo input values, so the secret cannot leak through this error.
    throw new Error(`invalid configuration\n${z.prettifyError(parsed.error)}`);
  }
  const value = parsed.data;
  let cardKey: KeyPair;
  try {
    cardKey = KeyPair.fromString(value.CARD_PRIVATE_KEY as KeyPairString);
  } catch {
    throw new Error("invalid configuration\nCARD_PRIVATE_KEY is not a valid ed25519 secret key");
  }
  return {
    network: value.NETWORK,
    rpcUrl: value.RPC_URL ?? RPC_URLS[value.NETWORK],
    vaultId: value.VAULT_ID,
    indexerUrl: value.INDEXER_URL,
    cardKey,
    logLevel: value.LOG_LEVEL,
  };
}
