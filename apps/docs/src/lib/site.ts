// The site structure from `src/site.json`, which also drives `scripts/sync-content.mjs`.
import site from "~/site.json";

const EDIT_BASE = "https://github.com/comatocard/comatocard/edit/main/";

export type SitePage = {
  route: string;
  title: string;
  description: string;
  /** Position in reading order, which also picks the card illustration. */
  index: number;
  /** Section route, for example `/build`, or undefined for the home page. */
  section?: string;
  heroImgUrl?: string;
  /** Repository path of the Markdown the page renders. */
  source?: string;
  editUrl?: string;
};

export type SiteSection = SitePage & { overview: string; pages: SitePage[] };

let index = 0;
const next = () => index++;

export const home: SitePage = { route: "/", ...site.home, index: next() };

export const sections: SiteSection[] = site.sections.map((s) => {
  const route = `/${s.slug}`;
  const overview: SitePage = {
    route: `${route}/overview`,
    title: s.title,
    description: s.description,
    section: route,
    heroImgUrl: s.hero,
    index: next(),
  };
  return {
    ...overview,
    route,
    overview: overview.route,
    pages: s.pages.map((p) => ({
      route: `${route}/${p.slug}`,
      title: p.title,
      description: p.description,
      section: route,
      source: p.source,
      editUrl: `${EDIT_BASE}${p.source}`,
      index: next(),
    })),
  };
});

/** Every page in reading order: home, then each overview followed by its pages. */
export const pages: SitePage[] = [
  home,
  ...sections.flatMap((s) => [{ ...s, route: s.overview }, ...s.pages]),
];

const byRoute = new Map(pages.map((p) => [p.route, p]));

/** `/build/integration/` and `/build/integration` both become `/build/integration`. */
export const normalizeRoute = (pathname: string) =>
  pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname || "/";

export const pageAt = (pathname: string) => byRoute.get(normalizeRoute(pathname));

export const isOverview = (pathname: string) => normalizeRoute(pathname).endsWith("/overview");

/** The home page, section routes and overviews: pages with the wide layout and no TOC. */
export const isMainRoute = (pathname: string) => {
  const route = normalizeRoute(pathname);
  return route === "/" || sections.some((s) => s.route === route || s.overview === route);
};

/** The page after `page` in reading order; after a section's last page, the next overview. */
export const nextPage = (page: SitePage): SitePage | undefined => pages[pages.indexOf(page) + 1];
