# apps/docs

The documentation site for https://docs.comatocard.xyz: Nextra 2 on Next.js, exported as static files.

The pages are not written here. `scripts/sync-content.mjs` turns the repository Markdown (`docs/` and the READMEs) into the site sections on every `dev`, `build` and `typecheck`, so `docs/` stays the single source. The section list, titles and descriptions live in `SECTIONS` in that script; the home page is `src/pages/index.mdx`.

## Run locally
1. `pnpm install` at the repository root.
2. `pnpm --filter @comatocard/docs dev` and open http://localhost:3001.
3. Edit a file under `docs/` and restart `dev` to see it on the site.

## Build and test
- `pnpm --filter @comatocard/docs build` writes the static site to `apps/docs/out/`, ready for any static host.
- `pnpm --filter @comatocard/docs test` checks the Markdown to MDX conversion and the link rewrites.
- `pnpm --filter @comatocard/docs lint` runs Biome and the SonarJS rules.

## Origin
Built from [zeta-chain/docs](https://github.com/zeta-chain/docs) (MIT, see [LICENSE](LICENSE)): its layout, components, illustrations and article icons. ZetaChain content, logos, fonts, services and packages are removed.
