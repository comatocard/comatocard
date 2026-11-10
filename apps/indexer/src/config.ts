import { accountId } from "@comatocard/sdk";
import { z } from "zod";

const NETWORKS = {
  testnet: { neardata: "https://testnet.neardata.xyz", rpc: "https://rpc.testnet.near.org" },
  mainnet: { neardata: "https://mainnet.neardata.xyz", rpc: "https://rpc.mainnet.near.org" },
} as const;

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const schema = z.object({
  NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  FACTORY_ID: accountId,
  REGISTRY_ID: z.preprocess(emptyToUndefined, accountId.optional()),
  DATABASE_URL: z.string().min(1),
  START_BLOCK: z.preprocess(emptyToUndefined, z.coerce.number().int().nonnegative().optional()),
  NEARDATA_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  NEARDATA_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  NEARDATA_MIN_INTERVAL_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().nonnegative().optional(),
  ),
  RPC_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
});

export interface Config {
  network: "testnet" | "mainnet";
  factoryId: string;
  registryId: string | undefined;
  databaseUrl: string;
  startBlock: number | undefined;
  neardataUrl: string;
  neardataApiKey: string | undefined;
  neardataMinIntervalMs: number | undefined;
  rpcUrl: string;
  port: number;
  logLevel: z.infer<typeof schema>["LOG_LEVEL"];
  pollIntervalMs: number;
}

/** Reads and validates the configuration from environment variables. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`invalid configuration\n${z.prettifyError(parsed.error)}`);
  }
  const value = parsed.data;
  const defaults = NETWORKS[value.NETWORK];
  return {
    network: value.NETWORK,
    factoryId: value.FACTORY_ID,
    registryId: value.REGISTRY_ID,
    databaseUrl: value.DATABASE_URL,
    startBlock: value.START_BLOCK,
    neardataUrl: value.NEARDATA_URL ?? defaults.neardata,
    neardataApiKey: value.NEARDATA_API_KEY,
    neardataMinIntervalMs: value.NEARDATA_MIN_INTERVAL_MS,
    rpcUrl: value.RPC_URL ?? defaults.rpc,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    pollIntervalMs: value.POLL_INTERVAL_MS,
  };
}
