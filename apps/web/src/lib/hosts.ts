/** The owner app's routes. Everything else (the landing page, `/shop`) belongs to the site. */
const APP_PATHS = ["/connect", "/setup", "/home", "/cards", "/activity", "/approvals", "/account"];

export type HostRoute =
  | { kind: "next" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; url: string };

function isAppPath(pathname: string): boolean {
  return APP_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Splits the site and the app across two hosts, for example `comatocard.xyz` and
 * `app.comatocard.xyz`. On the app host `/` opens the app; on the site host an app route moves to
 * the app host, so an old link still lands. A route on the wrong host keeps its path and query.
 * With either origin unset, or on any other host (a preview, localhost), nothing changes.
 */
export function routeHost(
  host: string | null,
  pathname: string,
  search: string,
  origins: { site: string | undefined; app: string | undefined },
): HostRoute {
  if (!host || !origins.site || !origins.app) return { kind: "next" };
  const site = new URL(origins.site);
  const app = new URL(origins.app);
  if (host === app.host) {
    if (pathname === "/") return { kind: "rewrite", pathname: "/connect" };
    if (!isAppPath(pathname))
      return { kind: "redirect", url: `${site.origin}${pathname}${search}` };
    return { kind: "next" };
  }
  if (host === site.host && isAppPath(pathname)) {
    return { kind: "redirect", url: `${app.origin}${pathname}${search}` };
  }
  return { kind: "next" };
}
