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
});
