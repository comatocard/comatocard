import { type RiskAssessment, riskAssessment } from "@comatocard/sdk";
import { z } from "zod";

/** Asks the indexer how risky paying `merchant` from this vault is. */
export type RiskCheck = (merchant: string) => Promise<RiskAssessment>;

export function indexerRisk(options: {
  indexerUrl: string;
  vaultId: string;
  fetch?: typeof globalThis.fetch;
}): RiskCheck {
  const fetchFn = options.fetch ?? globalThis.fetch;
  return async (merchant) => {
    const base = options.indexerUrl.endsWith("/") ? options.indexerUrl : `${options.indexerUrl}/`;
    const url = new URL(`risk/${encodeURIComponent(merchant)}`, base);
    url.searchParams.set("vault", options.vaultId);
    const response = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`risk ${merchant}: indexer responded ${response.status}`);
    const parsed = riskAssessment.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`risk ${merchant}: unexpected response\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  };
}
