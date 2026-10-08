---
subjects:
  - docs/contributing/maintainer-smokes.md
---
# 404 — The judge-replay harness stays throwaway

- **Status:** accepted
- **Date:** 2026-10-08
- **Design:** docs/contributing/design/recalibrate-failing-test-first-grader.md · **Supersedes/Refines:** none

## Context

The faithful replay (ADR-403) is a scratch plugin-eval suite generated from recorded results. It could stay a one-off, or become a committed tool.

## Options considered

1. **Throwaway harness plus a short bullet in `maintainer-smokes.md`** *(recommended)* — pros: the method and its format trap stay findable; nothing new to maintain / cons: the next calibration rebuilds the suite by hand
2. **A committed replay script under `scripts/`** — pros: repeatable in one command / cons: a new tested tool for one calibration so far
3. **Nothing recorded** — pros: no change / cons: the `claude -p` finding is lost

## Decision

The user chose option 1. The harness is not committed. `maintainer-smokes.md` § Behavioural eval suite carries one bullet that describes the method and says why a `claude -p` replay misleads.

## Consequences

- If a third grader calibration needs the harness, revisit option 2.
