---
subjects:
  - test/plugin-evals-local-only.test.js
  - scripts/ci.sh
  - evals/**
---
# 393 — The eval suite is checked by the CLI and paid pilots, never by a CI test over `evals/`

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

The suite runs locally on demand; CI, the workflows and the test suites must not invoke `claude plugin eval` or depend on `evals/`. The CLI already validates every case at load (unknown keys, template lines, schema, duplicate grader names, tool grants).

## Options considered

1. **No checker over `evals/`; CLI load-time validation plus approved one-run pilots; CI guard tests over `ci.sh`, workflows, `.gitignore` and the maintainer smokes that never read `evals/`** *(recommended)* — pros: honours the local-only rule, no schema copy / cons: a malformed case surfaces only at a run
2. **A local-only checker bin, unit-tested, not wired into CI** — pros: free pre-run check / cons: re-implements a schema the CLI owns and drifts on upgrade
3. **A structural test over `evals/` in CI** — pros: catches mistakes early / cons: contradicts the local-only rule

## Decision

**adopted-as-recommended (no user judgment).** Option 1. `test/plugin-evals-local-only.test.js` pins that no CI path invokes the eval CLI or names `evals/`, that `/evals/results/` is gitignored, and that every fenced `claude plugin eval` run command in the maintainer smokes carries `--no-publish` and none carries `--trust-plugin`. No test reads `evals/`.

## Consequences

- A grader regex that mirrors a normalizer pattern is kept in step by the maintainer smokes' pairing note, not by a test.
