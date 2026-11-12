import { accountId } from "@comatocard/sdk";
import { KeyPair, type KeyPairString } from "near-api-js";
import { z } from "zod";

const RPC_URLS = {
  testnet: "https://rpc.testnet.near.org",
  mainnet: "https://rpc.mainnet.near.org",
} as const;

const unsetIfEmpty = (value: unknown) => (value === "" ? undefined : value);

const schema = z.object({
  NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  RPC_URL: z.preprocess(unsetIfEmpty, z.url().optional()),
  FACTORY_ID: accountId,
  INDEXER_URL: z.url().default("http://localhost:4000"),
  RELAYER_ACCOUNT_ID: accountId,
  RELAYER_PRIVATE_KEY: z.string().startsWith("ed25519:", "must be an ed25519:<base58> secret key"),
  PORT: z.coerce.number().int().positive().default(4100),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export interface Config {
  network: "testnet" | "mainnet";
  rpcUrl: string;
  factoryId: string;
  indexerUrl: string;
  relayerAccountId: string;
  /** Holds the secret; never pass it to a logger. */
  relayerKey: KeyPair;
  port: number;
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
  let relayerKey: KeyPair;
  try {
    relayerKey = KeyPair.fromString(value.RELAYER_PRIVATE_KEY as KeyPairString);
  } catch {
    throw new Error("invalid configuration\nRELAYER_PRIVATE_KEY is not a valid ed25519 secret key");
  }
  return {
    network: value.NETWORK,
    rpcUrl: value.RPC_URL ?? RPC_URLS[value.NETWORK],
    factoryId: value.FACTORY_ID,
    indexerUrl: value.INDEXER_URL,
    relayerAccountId: value.RELAYER_ACCOUNT_ID,
    relayerKey,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
  };
}
