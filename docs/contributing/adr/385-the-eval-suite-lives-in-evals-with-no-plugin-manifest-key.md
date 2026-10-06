---
subjects:
  - evals/**
  - .claude-plugin/plugin.json
---
# 385 — The eval suite lives in `evals/` with no plugin-manifest key

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

`claude plugin eval` discovers cases under `--eval-dir`, else the plugin manifest's `experimental.evals`, else `evals/`. craft's `.claude-plugin/plugin.json` ships to every installing user and carries no `experimental` key today; the CLI reports an invalid manifest as a load problem that voids a run.

## Options considered

1. **`evals/` at the repo root, no manifest key** *(recommended)* — pros: already the CLI default, zero manifest change / cons: none found
2. **`evals/` plus an explicit `experimental.evals`** — pros: states the location / cons: adds nothing over the default and puts an experimental key in every user's manifest
3. **A custom directory via the key or `--eval-dir`** — pros: groups quality tooling / cons: every documented command must carry the flag, or the manifest gains the key

## Decision

**adopted-as-recommended (no user judgment).** Option 1. Cases live under `evals/<case>/` at the repo root; `.claude-plugin/plugin.json` stays unchanged and no documented command passes `--eval-dir`.

## Consequences

- Results land in `evals/results/`, which is gitignored (`/evals/results/`).
- Moving the suite later means adding the manifest key or the flag everywhere — a cheap, visible change.
