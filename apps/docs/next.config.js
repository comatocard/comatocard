const withNextra = require("nextra")({
  theme: "nextra-theme-docs",
  themeConfig: "./src/theme.config.tsx",
  defaultShowCopyCode: true,
});

/** @type {import('next').NextConfig} */
module.exports = withNextra({
  reactStrictMode: true,
  // Static site: `next build` writes out/, which any static host can serve.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  // Set when the site is served under a path, for example /comatocard on GitHub Pages.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
});
