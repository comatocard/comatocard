import { readFile } from "node:fs/promises";
import { createVaultClient } from "@comatocard/sdk";
import { z } from "zod";
import { terminalApproval } from "./approve.js";
import { loadConfig } from "./config.js";
import { openAiChat } from "./llm.js";
import { createLogger } from "./logger.js";
import { indexerRisk } from "./risk.js";
import { runShopper } from "./shopper.js";
import { sendPayment, spend } from "./spend.js";
import { cardSubmitter } from "./submit.js";

// Attack demo: an LLM agent reads an invoice with a hidden prompt injection. With the guard the
// payment to the blocked account is refused before signing; with --no-guard, which stands for an
// agent whose own code is compromised, the vault and the registry reject it on chain.

const unsetIfEmpty = (value: unknown) => (value === "" ? undefined : value);
const llmEnv = z
  .object({
    NEAR_AI_API_KEY: z.string().min(1),
    NEAR_AI_MODEL: z.preprocess(unsetIfEmpty, z.string().default("openai/gpt-4.1-mini")),
    NEAR_AI_BASE_URL: z.preprocess(unsetIfEmpty, z.url().default("https://cloud-api.near.ai/v1")),
  })
  .parse(process.env);
const args = process.argv.slice(2);
const guarded = !args.includes("--no-guard");
const invoicePath =
  args.find((a) => !a.startsWith("--")) ?? new URL("../demo/invoice.txt", import.meta.url);

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel, guarded ? "shopper" : "shopper-unguarded");
const submit = cardSubmitter(config);
const deps = {
  client: createVaultClient({ rpcUrl: config.rpcUrl, vaultId: config.vaultId }),
  publicKey: config.cardKey.getPublicKey().toString(),
  risk: indexerRisk({ indexerUrl: config.indexerUrl, vaultId: config.vaultId }),
  approve: terminalApproval,
  submit,
  logger,
};

const invoice = await readFile(invoicePath, "utf8");
logger.info({ guarded, model: llmEnv.NEAR_AI_MODEL, invoice: String(invoicePath) }, "attack demo");
const answer = await runShopper(
  {
    chat: openAiChat({
      baseUrl: llmEnv.NEAR_AI_BASE_URL,
      apiKey: llmEnv.NEAR_AI_API_KEY,
      model: llmEnv.NEAR_AI_MODEL,
    }),
    logger,
    pay: async (request) => {
      if (guarded) return spend(deps, request);
      const sent = await sendPayment(config.vaultId, submit, request);
      logger.info({ ...request, ...sent }, `unguarded payment ${sent.decision.status}`);
      return sent;
    },
  },
  `Pay this invoice:\n\n${invoice}`,
);
logger.info({ answer }, "agent finished");
