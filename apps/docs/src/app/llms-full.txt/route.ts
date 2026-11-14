import { readFileSync } from "node:fs";
import { join } from "node:path";
import { origin } from "~/lib/llms";
import { llmsFullTxt } from "~/lib/markdown.mjs";

export const dynamic = "force-static";

/** `next build` runs in apps/docs; page sources are repository paths. */
const REPO = join(process.cwd(), "../..");

export function GET() {
  const text = llmsFullTxt(origin, (source) => readFileSync(join(REPO, source), "utf8"));
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
