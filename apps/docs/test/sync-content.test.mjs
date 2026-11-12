import assert from "node:assert/strict";
import { test } from "node:test";

import { SECTIONS, toMdx } from "../scripts/sync-content.mjs";

test("drops the H1 and escapes JSX and expressions in prose only", () => {
  const out = toMdx(
    "# Title\n\nPay <amount> with {fee}.\n\n```rust\nfn x<T>() {}\n```\n",
    "docs/a.md",
  );
  assert.equal(out, "Pay &lt;amount> with \\{fee\\}.\n\n```rust\nfn x<T>() {}\n```\n");
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

test("every page has a unique slug and a description", () => {
  for (const section of SECTIONS) {
    const slugs = section.pages.map(([slug]) => slug);
    assert.equal(new Set(slugs).size, slugs.length, section.slug);
    assert.ok(!slugs.includes("overview"), `${section.slug} reserves overview`);
    for (const [, , title, description] of section.pages) assert.ok(title && description);
  }
});
