import type { NextSeoProps } from "next-seo";

export const defaultTitle = "Comatocard Docs";
export const defaultDescription =
  "Programmable payment cards for people and AI agents, enforced by smart contracts on NEAR.";
export const defaultBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://docs.comatocard.xyz/";

export const nextSeoProps: NextSeoProps = {
  titleTemplate: `%s – ${defaultTitle}`,
  description: defaultDescription,
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    locale: "en",
    type: "website",
    site_name: defaultTitle,
    url: defaultBaseUrl,
  },
  twitter: { cardType: "summary" },
};
