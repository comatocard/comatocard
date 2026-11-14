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

/** The policy assistant service: the NEAR AI key and no relayer key. */
const assistantSchema = z.object({
  NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  RPC_URL: z.preprocess(unsetIfEmpty, z.url().optional()),
  FACTORY_ID: accountId,
  PORT: z.coerce.number().int().positive().default(4200),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NEAR_AI_API_KEY: z.string().min(1),
  NEAR_AI_BASE_URL: z.preprocess(unsetIfEmpty, z.url().default("https://cloud-api.near.ai/v1")),
  POLICY_MODEL: z.preprocess(unsetIfEmpty, z.string().min(1).default("Qwen/Qwen3.8-27B")),
});

export interface NearAiConfig {
  baseUrl: string;
  /** Holds the secret; never pass it to a logger. */
  apiKey: string;
  model: string;
}

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

export interface AssistantConfig {
  rpcUrl: string;
  factoryId: string;
  port: number;
  logLevel: z.infer<typeof schema>["LOG_LEVEL"];
  nearAi: NearAiConfig;
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

/** Reads the policy assistant's configuration; it never reads the relayer key. */
export function loadAssistantConfig(env: Record<string, string | undefined>): AssistantConfig {
  const parsed = assistantSchema.safeParse(env);
  if (!parsed.success) {
    // Zod messages never echo input values, so the key cannot leak through this error.
    throw new Error(`invalid configuration\n${z.prettifyError(parsed.error)}`);
  }
  const value = parsed.data;
  return {
    rpcUrl: value.RPC_URL ?? RPC_URLS[value.NETWORK],
    factoryId: value.FACTORY_ID,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    nearAi: {
      baseUrl: value.NEAR_AI_BASE_URL,
      apiKey: value.NEAR_AI_API_KEY,
      model: value.POLICY_MODEL,
    },
  };
}
