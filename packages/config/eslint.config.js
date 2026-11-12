// SonarJS rules for every TypeScript workspace, the same rules SonarQube applies to TypeScript.
// Biome stays the formatter and the general linter; ESLint runs only the Sonar rule set.
// typescript-eslint parses with TypeScript 6 (a dependency of this package) because TypeScript 7,
// which compiles the workspaces, no longer exposes the JavaScript API a parser needs.
import { defineConfig } from "eslint/config";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", "**/.next/**", "**/out/**"] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: sonarjs.configs.recommended.rules,
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
);
