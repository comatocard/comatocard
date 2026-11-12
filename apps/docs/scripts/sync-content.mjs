// Generates the site pages from the repository Markdown, so `docs/` and the READMEs stay the
// single source. Output under src/pages/<section>/ is generated and git-ignored.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(SITE, "../..");
const PAGES = join(SITE, "src/pages");
const GITHUB = "https://github.com/comatocard/comatocard";

/** Section order, landing image and pages: [slug, source, title, description]. */
export const SECTIONS = [
  {
    slug: "start",
    title: "Get Started",
    description: "What Comatocard is, how it fits together and how to try it on NEAR testnet.",
    hero: "/img/pages/start.svg",
    pages: [
      [
        "introduction",
        "README.md",
        "Introduction",
        "Programmable payment cards for people and AI agents, enforced by smart contracts on NEAR.",
      ],
      [
        "architecture",
        "docs/architecture.md",
        "Architecture",
        "Vaults, cards, the factory, the registry, the indexer and the agents, and how a payment flows through them.",
      ],
      [
        "deployments",
        "docs/deployments.md",
        "Testnet Deployment",
        "Contract accounts, code hashes and the recorded end-to-end checks on NEAR testnet.",
      ],
    ],
  },
  {
    slug: "build",
    title: "Build",
    description: "Integrate cards into an app, a merchant checkout or an agent.",
    hero: "/img/pages/build.svg",
    pages: [
      [
        "integration",
        "docs/integration.md",
        "Integration Guide",
        "Accept card payments as a merchant and pay from a card in an app or agent.",
      ],
      [
        "sdk",
        "packages/sdk/README.md",
        "TypeScript SDK",
        "Types, event schemas, the vault client and compliance helpers in @comatocard/sdk.",
      ],
      [
        "events",
        "docs/specs/events.md",
        "Events",
        "The NEP-297 events every vault, registry and factory emits.",
      ],
      [
        "indexer-api",
        "docs/specs/indexer-api.md",
        "Indexer API",
        "REST, WebSocket, risk verdicts and the accountant CSV export.",
      ],
      [
        "indexer",
        "apps/indexer/README.md",
        "Run the Indexer",
        "Run the Rust indexer with Postgres against NEAR testnet.",
      ],
    ],
  },
  {
    slug: "contracts",
    title: "Contracts",
    description: "The vault, factory and registry contracts and their interfaces.",
    hero: "/img/pages/tools.svg",
    pages: [
      [
        "vault-spec",
        "docs/specs/vault-contract.md",
        "Vault Specification",
        "State, policies, payments, approvals and card tokens of the vault contract.",
      ],
      [
        "vault",
        "contracts/vault/README.md",
        "Vault",
        "Modules, build and tests of the vault contract.",
      ],
      [
        "factory",
        "contracts/factory/README.md",
        "Factory",
        "Publishes the vault code as a global contract and creates vaults.",
      ],
      [
        "registry",
        "contracts/registry/README.md",
        "Registry",
        "Counterparty registry with reports, curators and sanctions listings.",
      ],
      [
        "mock-ft",
        "contracts/mock-ft/README.md",
        "tUSD",
        "The testnet stablecoin with a public faucet.",
      ],
    ],
  },
  {
    slug: "agents",
    title: "Agents",
    description:
      "AI agents that hold cards: the guard, the treasury on NEAR Intents and the policy assistant.",
    hero: "/img/pages/use.svg",
    pages: [
      [
        "agents",
        "apps/agents/README.md",
        "Agents",
        "Spending agent and guard, treasury top-ups through NEAR Intents, the policy assistant and the attack demo.",
      ],
      [
        "relayer",
        "apps/relayer/README.md",
        "Relayer",
        "Gasless owner actions through NEP-366 meta transactions.",
      ],
    ],
  },
  {
    slug: "security",
    title: "Security",
    description: "Threat model, audit, compliance readiness and the research behind it.",
    hero: "/img/pages/about.svg",
    pages: [
      [
        "model",
        "docs/security.md",
        "Security Model",
        "Principles, threat model, audit results and engineering practice.",
      ],
      [
        "compliance",
        "docs/compliance.md",
        "Compliance Readiness",
        "Roles and custody, the controls in the product and the rules they map to.",
      ],
      [
        "compliance-research",
        "docs/compliance-research.md",
        "Compliance Research",
        "Indonesian and global rules for stablecoin payments, AML, sanctions, privacy and AI.",
      ],
    ],
  },
];

const routes = new Map(
  SECTIONS.flatMap((s) => s.pages.map(([slug, source]) => [source, `/${s.slug}/${slug}/`])),
);

/** Rewrites a Markdown link target found in `source` to a site route or a GitHub URL. */
function link(target, source) {
  if (/^[a-z]+:/i.test(target) || target.startsWith("#")) return target;
  const [path, hash = ""] = target.split("#");
  const repoPath = posix.normalize(posix.join(posix.dirname(source), path)).replace(/\/$/, "");
  const route = routes.get(repoPath);
  if (route) return route + (hash ? `#${hash}` : "");
  const kind = /\.[a-z0-9]+$/i.test(repoPath) ? "blob" : "tree";
  return `${GITHUB}/${kind}/main/${repoPath}${hash ? `#${hash}` : ""}`;
}

/** Escapes what MDX would parse as JSX or expressions in prose; code stays untouched. */
function prose(text, source) {
  return text
    .split(/(`[^`\n]*`)/)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part
        .replace(/<(https?:\/\/[^>\s]+)>/g, "[$1]($1)")
        .replace(/\]\(([^)\s]+)\)/g, (_, target) => `](${link(target, source)})`)
        .replace(/[{}]/g, (c) => `\\${c}`)
        .replace(/</g, "&lt;");
    })
    .join("");
}

/** Converts one Markdown file: drops the H1 (the title comes from frontmatter), escapes prose. */
export function toMdx(markdown, source) {
  const lines = markdown.replace(/^# .*\n+/, "").split("\n");
  let fenced = false;
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        return line;
      }
      return fenced ? line : prose(line, source);
    })
    .join("\n");
}

const yaml = (value) => JSON.stringify(value);

function overviewPage(section) {
  return `---
title: ${yaml(section.title)}
description: ${yaml(section.description)}
heroImgUrl: ${section.hero}
heroImgWidth: 464
---

import { CurrentPageNavigationSections } from "~/components/shared";

<div className="flex flex-col gap-20 sm:gap-[120px] w-full">
  <CurrentPageNavigationSections />
</div>
`;
}

function main() {
  for (const section of SECTIONS) {
    const dir = join(PAGES, section.slug);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const meta = { overview: { title: section.title, description: section.description } };
    writeFileSync(join(dir, "overview.mdx"), overviewPage(section));
    for (const [slug, source, title, description] of section.pages) {
      const markdown = readFileSync(join(REPO, source), "utf8");
      const edit = `${GITHUB}/edit/main/${source}`;
      const body = toMdx(markdown, source);
      writeFileSync(
        join(dir, `${slug}.mdx`),
        `---\ntitle: ${yaml(title)}\ndescription: ${yaml(description)}\neditUrl: ${yaml(edit)}\n---\n\n${body.trim()}\n`,
      );
      meta[slug] = { title, description };
    }
    writeFileSync(join(dir, "_meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  }
  console.log(`synced ${routes.size} pages from ${relative(SITE, REPO) || "."}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
