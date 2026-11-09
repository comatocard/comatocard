# NEAR HACKATHON: rules checklist

Summary of https://nearhackathon.com/HACKATHON.md as read on 2026-11-09. The live file wins on any conflict; re-read it before submitting.

## Dates (UTC)
| Milestone | Date |
|-|-|
| Announcement, code from here counts (Q-001) | 2026-10-19 |
| Development starts | 2026-11-01T00:00:00Z |
| **Development ends, repo public, submission closes** | **2026-11-14T23:59:00Z** |
| Judging | 2026-11-16 to 2026-11-18 |
| Hosted demo must stay up | until 2026-11-18, ideally 2026-11-25 |

## Judging
- Claude Code and Codex screen every project first: they check that it runs and does what the README says, write a report and a preliminary score (Q-017). Human judges decide.
- Previous NEAR hackathons judged technical implementation, design, impact, originality and sustainability.
- Consequence for us: the README must be reproducible as "do X, see Y" steps, with a dry-run or simulation path that needs no funds.

## Rules that affect this project
| Rule | Requirement | Our response |
|-|-|-|
| Q-005 | List libraries, templates and AI-generated code in the README | README section "Third-party code and tools" |
| Q-007 | NEAR Intents has no testnet | Contracts run on testnet; treasury uses `dry: true` quotes on testnet and small mainnet swaps from a separate dev account |
| Q-010 | Testnet-only projects are eligible | Default target is testnet |
| Q-011 | No mandatory integration | We integrate where it strengthens the product, not to collect logos |
| Q-012 | A local-only demo needs a video; screenshots are not enough | Hosted demo plus video |
| Q-014 | Any license, repo stays public through judging | MIT, `LICENSE` at the root |
| Q-015 | One person may enter at most 2 independent projects, each README names the other | Declare in README if it applies to any team member |

## Never without explicit team confirmation
- Sending the submission (one attempt per repository; mistakes go through https://nearhackathon.com/request-changes)
- Posting on X or any other network
- Making the repository public, pushing to `main`, force-pushing
- Signing mainnet transactions, spending tokens, deploying to mainnet
- Committing secrets

## Submission
`POST https://nearhackathon.com/api/applications`, fields: `requestId`, `projectName`, `leadName`, `email`, `size`, `tracks`, `nearAddress` (mainnet payout account), `projectUrl`, `demoUrl`, `idea`, `consent`. The team provides every value; nothing is guessed. The payload is never committed.

Demo post on X: built at NEAR HACKATHON, tags `@NEARProtocol` and `#NEARHackathon` (optionally `@NearLegion`, `@NearBuilders`), video attached, leads with the user problem, names NEAR's concrete role.

## Target tracks
| Track | Fit |
|-|-|
| `realworld` | Primary: stablecoin card payments, gasless for the cardholder, accountant export |
| `security` | Cards are function-call keys, on-chain policies, counterparty registry, prompt-injection demo |
| `agents` | Agents hold cards, pay HTTP 402 APIs, every purchase has a receipt |
| `social` | A Sputnik DAO can own a vault: tiered approvals through DAO proposals |
| `nfts`, `privacy`, `defi` | Stretch, see `docs/workstreams.md` |

## Resources
| Resource | Link |
|-|-|
| Track prompts | https://github.com/nearai/near-hackathon-prompt-examples |
| NEAR agent skills (`near-smart-contracts`, `near-api-js`, `near-dapp`, `near-intents`, `near-kit`, `near-ai-cloud`) | https://github.com/near/agent-skills |
| NEAR docs | https://docs.near.org |
| NEAR Intents and 1Click | https://docs.near-intents.org |
| NEAR AI Cloud | https://docs.near.ai/cloud/quickstart |
| Builder resources, testnet faucet | https://nearbuilders.org/build, https://near-faucet.io |
| Partner API keys (1Click JWT) | https://partners.near-intents.org |
| Community | https://discord.gg/nearprotocol, https://t.me/nearbuilderschat |
