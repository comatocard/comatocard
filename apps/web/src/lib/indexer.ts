import type { z } from "zod";

/** Raised when the indexer answers with an error or a body that does not match its schema. */
export class IndexerError extends Error {
  override name = "IndexerError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** GET from the indexer through the same-origin proxy, validated with the SDK schema. */
export async function indexerGet<T>(
  path: string,
  schema: z.ZodType<T>,
  params?: Record<string, string | undefined>,
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const query = search.size > 0 ? `?${search}` : "";
  const response = await fetch(`/api/indexer/${path}${query}`, { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new IndexerError(body?.error ?? `indexer answered ${response.status}`, response.status);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new IndexerError(`unexpected indexer response for ${path}`, 502);
  return parsed.data;
}

/** URL of the accountant CSV for a vault, served through the proxy. */
export const exportCsvUrl = (vault: string) => `/api/indexer/vaults/${vault}/export.csv`;
