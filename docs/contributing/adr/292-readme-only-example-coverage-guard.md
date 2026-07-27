# 292 — Example-dir coverage guard checks README only

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** docs/contributing/design/examples-catalog-gap-closure.md · **Supersedes/Refines:** none

## Context

`test/examples-lint.test.js` auto-discovers example dirs and lints each manifest but
checks no index, so `dod-artifact/` silently vanished from `examples/README.md`. A
mechanical completeness guard is needed; the question is which surfaces it covers.

## Options considered

1. **README only** — pros: README is the colocated index that claims per-dir
   completeness; mirrors the single-surface `readme-drift.sh` philosophy; the brief
   itself scopes the guard to README / cons: guide §3/§4 drift stays review-caught.
   **(designer's recommendation)**
2. **README + guide §4** — pros: wider net / cons: §4 is a curated narrative index that
   intentionally omits rows (e.g. `loop/`), so a mechanical set-diff would false-alarm.
3. **README + §3 catalog** — pros: guards the Sample column / cons: §3 rows are keyed by
   surface, not dir; the mapping is not mechanical.

## Decision

**Adopted-as-recommended (no user judgment).** The new coverage test asserts every
auto-discovered `examples/<dir>/` appears in `examples/README.md` as a linked
`](<dir>/)` token — README only.

## Consequences

README completeness is CI-enforced from now on; guide §3/§4 completeness remains a
documentation-phase and review concern. The guard fails red today on `dod-artifact`,
proving it catches the drift class it was built for.
