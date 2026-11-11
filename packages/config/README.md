# packages/config

`@comatocard/config`: shared configuration for the TypeScript workspaces.

- `tsconfig.base.json`: strict compiler options every workspace extends.
- `eslint.config.js`: the SonarJS rule set that SonarQube applies to TypeScript, so it runs locally and in CI without a Sonar token. Enable it with `export { default } from "@comatocard/config/eslint";` and run `eslint . --max-warnings 0` after `biome check .`. The parser uses TypeScript 6 from this package, since TypeScript 7 has no JavaScript API.
