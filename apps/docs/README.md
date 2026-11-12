# apps/docs

The documentation site at https://docs.comatocard.xyz/: Next.js App Router with Nextra 4, exported as static files, searched with Pagefind.

The pages are not written here. `src/site.json` lists the sections and the repository Markdown each page shows (`docs/` and the READMEs); at build time `src/app/[[...mdxPath]]/page.tsx` reads that file, converts it with `src/lib/markdown.mjs` and compiles it with Nextra, so `docs/` stays the single source. The layout, navigation, hero and cards read the same `site.json` through `src/lib/site.ts`.

## Run locally
1. `pnpm install` at the repository root.
2. `pnpm --filter @comatocard/docs dev` and open http://localhost:3001.
3. Edit a file under `docs/` and reload the page. Search needs a build, since Pagefind indexes the built HTML.

## Build and test
- `pnpm --filter @comatocard/docs build` writes the static site with its search index to `apps/docs/out/`, ready for any static host.
- `pnpm --filter @comatocard/docs test` checks the Markdown to MDX conversion, the link rewrites and that every page source in `site.json` exists and converts.
- `pnpm --filter @comatocard/docs lint` runs Biome and the SonarJS rules.

## Deploy
`.github/workflows/docs.yml` builds the site on every push to `main` that touches `apps/docs/`, `docs/` or a README, and deploys `out/` to GitHub Pages with the custom domain `docs.comatocard.xyz` (DNS: `CNAME docs comatocard.github.io`). Run it by hand from the Actions tab with "Run workflow". To serve it under a path instead, such as `comatocard.github.io/comatocard`, remove the custom domain and build with `NEXT_PUBLIC_BASE_PATH=/comatocard`.

## Origin
Built from [zeta-chain/docs](https://github.com/zeta-chain/docs) (MIT, see [LICENSE](LICENSE)): its layout, components, illustrations and article icons. ZetaChain content, logos, fonts, services and packages are removed.
