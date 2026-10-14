---
subjects:
  - hooks/git-no-ext-diff.sh
  - docs/contributing/specs/gate.md
---
# 553 — Each timeout claim carries the Claude Code version that measured it

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/claude-hook-foreground-stall-probe.md · **Supersedes/Refines:** none

## Context

The background-wait rows (both deny channels) ran on Claude Code 2.1.296; the foreground and tree-signal rows ran on 2.1.299. Neither probe re-ran the other's rows on its own version.

## Options considered

1. **Per claim: 2.1.296 on the background-wait claims, 2.1.299 on the foreground and tree-signal claims** *(recommended)* — keeps each claim on the version that measured it.
2. **One label, the latest (2.1.299)** — cons: puts a version on the JSON-deny row that never ran it.
3. **One range label, 2.1.296 to 2.1.299** — cons: reads as measured on every release in between.

## Decision

Adopted-as-recommended (no user judgment): option 1, per ADR-546's rule that a vendor-behaviour claim needs a live probe on the version it names. The crash-path line (2.1.296) is not re-labelled: its rows were not re-run.

## Consequences

The texts carry two version labels. A future probe re-labels only the claims it re-runs.
