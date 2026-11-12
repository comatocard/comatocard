import nextra from "nextra";

const withNextra = nextra({ defaultShowCopyCode: true, search: { codeblocks: false } });

/** @type {import('next').NextConfig} */
export default withNextra({
  reactStrictMode: true,
  // Static site: `next build` writes out/, which any static host can serve.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  // Set when the site is served under a path, for example /comatocard on GitHub Pages.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  // Pages are compiled from docs/ at build time (MDXRemote), so Next sees no MDX page and does
  // not map Nextra's MDX components import itself.
  turbopack: { resolveAlias: { "next-mdx-import-source-file": "./src/mdx-components.tsx" } },
});
