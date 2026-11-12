/**
 * Read routes of the indexer the browser may reach through `/api/indexer`. Anything else is 404,
 * so the proxy cannot be used to reach other paths of the upstream host.
 */
const ROUTES = [
  /^health$/,
  /^vaults$/,
  /^cards$/,
  /^vaults\/[a-z\d._-]+$/,
  /^vaults\/[a-z\d._-]+\/(cards|payments|approvals|export\.csv)$/,
  /^vaults\/[a-z\d._-]+\/(cards|payments)\/\d+$/,
  /^analytics\/[a-z\d._-]+$/,
  /^risk\/[a-z\d._-]+$/,
  /^merchants\/[a-z\d._-]+\/payments$/,
];

export function isIndexerRoute(path: string): boolean {
  return path.length <= 200 && ROUTES.some((route) => route.test(path));
}
