import { CardSvg, LocalnetSvg, ToolkitSvg, UniversalKitSvg } from "./components/svg/ShipFasterSvgs";

export type NarrowCardLink = {
  href: string;
  svg: React.ReactNode;
  title: string;
  description: string;
};

export const HERO_CARD_LINKS: NarrowCardLink[] = [
  {
    href: "/start/introduction/",
    svg: <CardSvg />,
    title: "Introduction",
    description: "Vaults, cards and policies on NEAR",
  },
  {
    href: "/start/deployments/",
    svg: <UniversalKitSvg />,
    title: "Try it on testnet",
    description: "Contracts, vaults and recorded checks",
  },
  {
    href: "/build/integration/",
    svg: <ToolkitSvg />,
    title: "Integrate",
    description: "Accept and make card payments",
  },
];

export const SHIP_FASTER_CARD_LINKS: NarrowCardLink[] = [
  {
    href: "/agents/agents/",
    svg: <LocalnetSvg />,
    title: "Agents",
    description: "Guard, treasury on NEAR Intents, policy assistant",
  },
  {
    href: "/build/indexer-api/",
    svg: <ToolkitSvg />,
    title: "Indexer API",
    description: "History, risk verdicts and CSV export",
  },
  {
    href: "/contracts/vault-spec/",
    svg: <CardSvg />,
    title: "Vault contract",
    description: "State, policies, payments and approvals",
  },
  {
    href: "/security/model/",
    svg: <UniversalKitSvg />,
    title: "Security",
    description: "Threat model, audit and compliance",
  },
];
