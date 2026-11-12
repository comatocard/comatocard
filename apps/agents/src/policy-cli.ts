import { accountId, createVaultClient } from "@comatocard/sdk";
import { z } from "zod";
import { createLogger } from "./logger.js";
import { proposePolicy } from "./policy-assistant.js";
import { verifiedChat } from "./private-chat.js";

// Proposes a card policy from a plain-language request. It never signs: when the answer is
// verified against the TEE that produced it, it prints the update_policy call for the owner.

const unsetIfEmpty = (value: unknown) => (value === "" ? undefined : value);
const env = z
  .object({
    VAULT_ID: accountId,
    RPC_URL: z.preprocess(unsetIfEmpty, z.url().default("https://rpc.testnet.near.org")),
    NEAR_AI_API_KEY: z.string().min(1),
    NEAR_AI_BASE_URL: z.preprocess(unsetIfEmpty, z.url().default("https://cloud-api.near.ai/v1")),
    POLICY_MODEL: z.preprocess(unsetIfEmpty, z.string().default("Qwen/Qwen3.8-27B")),
    LOG_LEVEL: z.preprocess(unsetIfEmpty, z.string().default("info")),
  })
  .parse(process.env);
const args = z
  .tuple([z.coerce.number().int().nonnegative(), z.string().min(3)])
  .safeParse(process.argv.slice(2));
if (!args.success) {
  console.error('usage: policy <card id> "<what to change, in plain language>"');
  process.exit(2);
}
const [cardId, request] = args.data;

const logger = createLogger(env.LOG_LEVEL, "policy-assistant");
const card = await createVaultClient({ rpcUrl: env.RPC_URL, vaultId: env.VAULT_ID }).getCard(
  cardId,
);
if (card === null) {
  logger.error({ vaultId: env.VAULT_ID, cardId }, "no such card");
  process.exit(1);
}
const proposal = await proposePolicy(
  {
    vaultId: env.VAULT_ID,
    chat: (messages) =>
      verifiedChat(
        { baseUrl: env.NEAR_AI_BASE_URL, apiKey: env.NEAR_AI_API_KEY, model: env.POLICY_MODEL },
        messages,
      ),
  },
  card,
  request,
);
if (proposal.kind === "invalid") {
  logger.warn(proposal, "no proposal");
  process.exitCode = 1;
} else if (!proposal.verification.verified) {
  logger.warn(proposal, "proposal not verified against the TEE, not offered for signing");
  process.exitCode = 1;
} else {
  logger.info(
    proposal,
    `proposal verified in TEE, changes: ${proposal.changed.join(", ") || "none"}`,
  );
  const args = JSON.stringify(proposal.call.args);
  console.log(
    `\nTo sign as the owner, gasless through the relayer:\n  pnpm --filter @comatocard/relayer owner-call ${env.VAULT_ID} update_policy '${args}'\n`,
  );
}
