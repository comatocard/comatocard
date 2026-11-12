// Imported only by route handlers: these addresses never reach the browser bundle.
/** Server-side base URLs of the services the browser cannot call directly (no CORS headers). */
export const INDEXER_URL = process.env.INDEXER_URL || "http://localhost:4000";
export const RELAYER_URL = process.env.RELAYER_URL || "http://localhost:4100";

/** Joins a base URL and a path without dropping the base's own path. */
export function upstream(base: string, path: string, search = ""): URL {
  const url = new URL(path.replace(/^\/+/, ""), base.endsWith("/") ? base : `${base}/`);
  url.search = search;
  return url;
}
