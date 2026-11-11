# Agent instructions

Rules for every coding agent (Claude Code, Codex, others) and every human contributor in this repository.

## Engineering principles
- Weigh quality, simplicity, robustness, scalability and long-term maintainability above development cost.
- Keep modules small, single-purpose and typed. Shared types live in `packages/sdk`; never duplicate them in an app.
- For one-off operational work, take the simplest direct end-to-end path. Add wrappers, control planes or automation only when a concrete blocker or a repeated need justifies them.
- Bug fixes start by reproducing the bug end to end, as close to the user experience as possible.
- Lint errors, failing tests and flaky tests are fixed when found, even if unrelated to the current task.
- UI work is checked in the running app and held to a pixel-perfect standard.
- Never edit generated files (lockfiles by hand, ABI output, build artifacts) or `CHANGELOG.md`.
- Ask for explicit approval before starting any harness feature that spawns many subagents at once.

## Quality gates
- Zero warnings and zero errors: rustc, clippy, rustfmt, Biome, tsc, tests and install output stay clean. CI treats warnings as errors.
- Root commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`. Each workspace exposes the same script names.

## Testing
Every behaviour change ships with tests in the right layer.
- Unit: next to the code (`#[cfg(test)] mod tests` in Rust, `*.test.ts` beside the module). No network, no chain, no database server.
- Integration: contracts in `contracts/<name>/tests/` against `near-sandbox`; TypeScript apps in `apps/<name>/test/integration/` against real dependencies run in-process; the Rust indexer in `apps/indexer/tests/` against Postgres started by testcontainers (needs Docker) and recorded blocks for neardata. Run with `pnpm test:integration`.
- Regression: one test per fixed bug, named after its issue (`issue_42_*.rs`, `issue-42-*.test.ts`), plus golden snapshots for event JSON and API responses. A regression test is never deleted or loosened to make CI pass.

## Repository map
See `README.md` for the layout and `docs/` for architecture, specs and workstreams. The specs in `docs/specs/` are the contract between workstreams; change them through a PR before changing code that depends on them.

## Identity
- GitHub account: `aliens101`. Several accounts are logged in on this machine and other sessions may change the active one, so do not switch it: run `export GH_TOKEN=$(gh auth token -u aliens101)` in the same shell command as every `gh` call and `git push`.
- Git author: `aliens101 <245101310+aliens101@users.noreply.github.com>` (repo-local config).
- No AI attribution anywhere: no co-author trailer, no "Generated with" line, no agent name in commits, issues, PRs or comments.

## Commits
- Small and single-purpose: one logical change per commit, tests together with the code they cover.
- Conventional Commits: `type(scope): summary`, imperative mood, max 72 characters.
  - Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `ci`.
  - Scope matches the area label: `contracts`, `indexer`, `agents`, `frontend`, `infra`.
- Never commit secrets, private keys, `.env` files or submission payloads.

## Issues and pull requests
- Every change starts with an issue and lands through a PR. No direct pushes to `main`, no force-push to `main`.
- Branch name: `<type>/<issue-number>-<short-slug>`, for example `feat/12-card-policy`.
- Every issue and PR has exactly one `type:*` label and at least one `area:*` label.
- PR body sections: Summary, Changes, Testing. Link the issue with `Closes #<n>`.

## Writing style
Applies to commits, issues, PRs, review comments, code comments and docs.
- English, professional, concise, on point. No filler, no emoji, no marketing.
- No double hyphen and no em dash in prose. Use a comma, a colon or a new sentence. Command-line flags inside code spans are the only exception.

## Hackathon constraints
Summary in `docs/hackathon.md`; the live rules at https://nearhackathon.com/HACKATHON.md win on any conflict.
- Making the repo public, the submission POST, posting on X, signing mainnet transactions and mainnet deploys need explicit confirmation from the team.
- The README stays reproducible: "do X, see Y" steps that a judge or an AI screener can follow.

## Maintaining this file
Keep only knowledge useful to almost every session. Point to the authoritative file or command instead of repeating it. Prefer rewriting or pruning entries over appending.
