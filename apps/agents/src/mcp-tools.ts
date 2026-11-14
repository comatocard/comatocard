import { accountId, paymentPage, u128, type VaultClient } from "@comatocard/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readCardStatus } from "./card.js";
import type { RiskCheck } from "./risk.js";
import { type SpendDeps, spend } from "./spend.js";

export interface ToolDeps {
  client: VaultClient;
  publicKey: string;
  indexerUrl: string;
  risk: RiskCheck;
  submit: SpendDeps["submit"];
  logger: SpendDeps["logger"];
  fetch?: typeof globalThis.fetch;
}

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

/**
 * The Comatocard card as MCP tools. `pay` runs the same guard as the `pay` CLI; a `warn` verdict
 * is refused, since an MCP client cannot be trusted to stand in for the human confirmation.
 */
export function createMcpServer(deps: ToolDeps, version: string): McpServer {
  const server = new McpServer({ name: "comatocard", version });
  const fetchFn = deps.fetch ?? globalThis.fetch;

  server.registerTool(
    "card_status",
    {
      description:
        "The vault and the card this agent holds: status, policy limits and what it spent today and this period.",
      annotations: { readOnlyHint: true },
    },
    async () => text(await readCardStatus(deps.client, deps.publicKey)),
  );

  server.registerTool(
    "preview_payment",
    {
      description:
        "What the vault would do with a payment, without paying: settle, queue for approval, or reject with the reason.",
      inputSchema: { merchant: accountId, amount: u128.describe("Smallest token unit") },
      annotations: { readOnlyHint: true },
    },
    async ({ merchant, amount }) =>
      text(await deps.client.previewPayment(deps.publicKey, merchant, amount)),
  );

  server.registerTool(
    "check_merchant",
    {
      description:
        "The indexer risk verdict (allow, warn or block) for paying a NEAR account from this vault, with reasons.",
      inputSchema: { merchant: accountId },
      annotations: { readOnlyHint: true },
    },
    async ({ merchant }) => text(await deps.risk(merchant)),
  );

  server.registerTool(
    "payment_history",
    {
      description: "Recent payments made with this card, newest first, from the indexer.",
      inputSchema: { limit: z.number().int().min(1).max(50).default(10) },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const { card } = await readCardStatus(deps.client, deps.publicKey);
      if (card === null)
        return { ...text({ error: "no card is bound to this key" }), isError: true };
      const base = deps.indexerUrl.endsWith("/") ? deps.indexerUrl : `${deps.indexerUrl}/`;
      const url = new URL(`vaults/${encodeURIComponent(deps.client.vaultId)}/payments`, base);
      url.searchParams.set("card", String(card.id));
      url.searchParams.set("limit", String(limit));
      const response = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`payments: indexer responded ${response.status}`);
      return text(paymentPage.parse(await response.json()));
    },
  );

  server.registerTool(
    "pay",
    {
      description:
        "Pay a merchant with the card. The guard previews the payment on the vault and asks the indexer for a risk verdict first; it refuses rejected payments, block verdicts and warn verdicts. Above the approval threshold the vault queues the payment for the owner. For an HTTP 402 challenge, pass its merchant, amount and reference.",
      inputSchema: {
        merchant: accountId,
        amount: u128.describe("Smallest token unit; tUSD has 6 decimals"),
        reference: z.string().min(1).max(64).optional(),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ merchant, amount, reference }) => {
      const outcome = await spend(
        { ...deps, approve: () => Promise.resolve(false) },
        { merchant, amount, ...(reference === undefined ? {} : { reference }) },
      );
      return outcome.kind === "refused" ? { ...text(outcome), isError: true } : text(outcome);
    },
  );

  return server;
}
