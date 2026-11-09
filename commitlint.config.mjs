const forbiddenDashes = /--|—/;

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "no-forbidden-dashes": ({ raw }) => [
          !forbiddenDashes.test(raw ?? ""),
          "use a comma, a colon or a new sentence instead of a double hyphen or an em dash",
        ],
      },
    },
  ],
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "test", "docs", "refactor", "chore", "ci"]],
    "scope-enum": [2, "always", ["contracts", "indexer", "agents", "frontend", "infra", "sdk"]],
    "header-max-length": [2, "always", 72],
    "no-forbidden-dashes": [2, "always"],
  },
};
