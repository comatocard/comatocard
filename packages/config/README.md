# packages/config

Shared tsconfig and tool presets for the workspace.

Workstream C.

## ESLint with SonarJS
`eslint.config.js` exports the SonarJS rule set that SonarQube applies to TypeScript, so every workspace runs it locally and in CI without a Sonar token: add `export { default } from "@comatocard/config/eslint";` and run `eslint . --max-warnings 0` after `biome check .`. The parser uses TypeScript 6 from this package, since TypeScript 7 has no JavaScript API.
