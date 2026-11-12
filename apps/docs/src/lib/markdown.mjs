// Turns the repository Markdown (`docs/` and the READMEs) into MDX for the site, so those files
// stay the single source. Plain JavaScript so `node --test` covers it without a build.
import { posix } from "node:path";

import site from "../site.json" with { type: "json" };

const GITHUB = "https://github.com/comatocard/comatocard";

/** Site route of every synced source file, for example `docs/security.md` to `/security/model/`. */
const routes = new Map(
  site.sections.flatMap((s) => s.pages.map((p) => [p.source, `/${s.slug}/${p.slug}/`])),
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

/**
 * Converts one Markdown file found at `source` (a repository path): drops the H1, since the
 * page hero shows the title, and escapes prose.
 * @param {string} markdown
 * @param {string} source
 * @returns {string}
 */
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
    .join("\n")
    .trim();
}
