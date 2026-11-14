import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { toMdx } from "../src/lib/markdown.mjs";
import site from "../src/site.json" with { type: "json" };

const repoFile = (path) => new URL(`../../../${path}`, import.meta.url);

test("drops the H1 and escapes JSX and expressions in prose only", () => {
  const out = toMdx(
    "# Title\n\nPay <amount> with {fee}.\n\n```rust\nfn x<T>() {}\n```\n",
    "docs/a.md",
  );
  assert.equal(out, "Pay &lt;amount> with \\{fee\\}.\n\n```rust\nfn x<T>() {}\n```");
});

test("issue 152: drops the logo above the H1 with the H1", () => {
  const out = toMdx(
    '<img src="logo.svg" alt="Logo" width="72">\n\n# Title\n\nBody.\n',
    "README.md",
  );
  assert.equal(out, "Body.");
  const readme = toMdx(readFileSync(repoFile("README.md"), "utf8"), "README.md");
  assert.doesNotMatch(readme, /&lt;img|^# /m);
});

test("drops lines made only of badges", () => {
  const out = toMdx(
    "# Title\n\n[![CI](https://x/ci.svg)](https://x/ci) [![MIT](https://x/mit.svg)](LICENSE)\n\nBody with [![CI](https://x/ci.svg)](https://x/ci).\n",
    "README.md",
  );
  assert.equal(out, "Body with [![CI](https://x/ci.svg)](https://x/ci).");
});

test("leaves inline code untouched", () => {
  assert.equal(toMdx("Call `get<T>({})` now.", "docs/a.md"), "Call `get<T>({})` now.");
});

test("turns autolinks into Markdown links", () => {
  assert.equal(
    toMdx("See <https://near.org>.", "docs/a.md"),
    "See [https://near.org](https://near.org).",
  );
});

test("rewrites links to synced pages as routes and others to GitHub", () => {
  const out = toMdx(
    "[spec](specs/vault-contract.md#types) [agents](../apps/agents/README.md) [code](../contracts/vault/src/lib.rs) [dir](../apps/indexer) [web](https://near.org) [top](#top)",
    "docs/security.md",
  );
  assert.equal(
    out,
    "[spec](/contracts/vault-spec/#types) [agents](/agents/agents/) " +
      "[code](https://github.com/comatocard/comatocard/blob/main/contracts/vault/src/lib.rs) " +
      "[dir](https://github.com/comatocard/comatocard/tree/main/apps/indexer) [web](https://near.org) [top](#top)",
  );
});

test("every page has a unique slug, a description and a source that exists", () => {
  for (const section of site.sections) {
    const slugs = section.pages.map((page) => page.slug);
    assert.equal(new Set(slugs).size, slugs.length, section.slug);
    assert.ok(!slugs.includes("overview"), `${section.slug} reserves overview`);
    for (const page of section.pages) {
      assert.ok(page.title && page.description, page.slug);
      assert.ok(existsSync(repoFile(page.source)), page.source);
    }
  }
});

test("converts every source without leaving a raw tag or brace in prose", () => {
  for (const page of site.sections.flatMap((s) => s.pages)) {
    const prose = toMdx(readFileSync(repoFile(page.source), "utf8"), page.source)
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]*`/g, "");
    assert.doesNotMatch(prose, /<[a-z]|(?<!\\)[{}]/i, page.source);
  }
});
