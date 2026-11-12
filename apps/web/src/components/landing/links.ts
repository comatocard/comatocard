/** Where the landing page sends people. */
export const LINKS = {
  app: "/connect",
  shop: "/shop",
  repo: "https://github.com/comatocard/comatocard",
  docs: "https://github.com/comatocard/comatocard/tree/main/docs",
  compliance: "https://github.com/comatocard/comatocard/blob/main/docs/compliance.md",
  near: "https://near.org",
} as const;

/** In-page anchors shared by the nav and the footer. */
export const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "security", label: "Security" },
  { id: "merchants", label: "Merchants" },
] as const;
