---
subjects:
  - README.md
  - docs/guides/comparison.md
---
# 501 — The comparison table is a README section

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/public-front-door-completion.md · **Supersedes/Refines:** none

## Context

The table could live in the README, in a new guide page, or inside the measured cost experiment page `docs/guides/comparison.md`.

## Options considered

1. **README section after *What craft is not*, linking `comparison.md` for numbers** *(recommended)* — pros: the brief scopes it as a README item; one small table
2. **New `docs/guides/positioning.md` + one README line** — pros: README stays shorter / cons: a page for one table
3. **Extend `docs/guides/comparison.md`** — pros: one comparison home / cons: mixes positioning into a measured experiment

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** A `## How craft compares` README section sits after *What craft is not*; it holds no digits and links `docs/guides/comparison.md`, which stays the single home of the measured numbers and is not edited.

## Consequences

README grows by one section. Cost figures are never restated in the table.
