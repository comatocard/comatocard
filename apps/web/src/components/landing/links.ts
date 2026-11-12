/** Where the landing page sends people. */
export const LINKS = {
  app: "/connect",
  repo: "https://github.com/comatocard/comatocard",
  docs: "https://comatocard.github.io/comatocard",
  compliance: "https://github.com/comatocard/comatocard/blob/main/docs/compliance.md",
  near: "https://near.org",
} as const;

/** In-page targets for the nav and the footer. */
export const SECTION = {
  safety: "safety",
  steps: "start",
  merchants: "merchants",
  faq: "faq",
} as const;

export const NAV_ITEMS = [
  { label: "Why Comatocard", target: SECTION.safety },
  { label: "How it works", target: SECTION.steps },
  { label: "Merchants", target: SECTION.merchants },
  { label: "FAQ", target: SECTION.faq },
] as const;

/** Shared horizontal rhythm for the page below the intro. */
export const GUTTER = "px-5 sm:px-10 md:px-14";

/** The large light headline every section uses. */
export const HEADLINE = {
  fontSize: "clamp(2.1rem, 6vw, 4.25rem)",
  lineHeight: 0.98,
  letterSpacing: "-0.03em",
} as const;

export const INK = "text-[#18161B]";
export const PAGE_BG = "bg-[#F4F0ED]";
