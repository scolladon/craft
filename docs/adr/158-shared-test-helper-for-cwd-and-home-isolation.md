# 158 — Shared test helper for cwd and HOME isolation

- **Status:** accepted
- **Date:** 2026-06-26
- **Design:** docs/design/hermetic-test-suites.md · **Supersedes/Refines:** none

## Context

Three remedied sites (A2 empty-cwd, A3 seeded-cwd, A4 empty-HOME) all perform the same
dance: create an mktemp dir, redirect an ambient root (`process.cwd()` via `chdir`, or
`process.env.HOME`/`USERPROFILE`), run the unit, then restore and remove the dir in a
`finally`. Open-coding it at each site risks an inconsistent or missing restore (a
`chdir` without restore is itself a hermeticity defect).

## Options considered

1. **inline per test** (designer recommendation) — pros: mirrors the landed reference
   fix; no new abstraction for only 2–3 sites (YAGNI). cons: duplicates the
   restore-in-`finally` logic; each copy is a chance to forget the restore.
2. **shared helper `engine/test-helpers/with-cwd.js`** — pros: one audited
   implementation of the restore guarantee; call sites read as intent
   (`withTempCwd(...)`, `withTempHome(...)`); future offenders reuse it. cons: a new
   helper file for few current callers.

## Decision

Adopt the **shared helper** (user judgment, deviates from the designer's recommendation
of option 1). Add `engine/test-helpers/with-cwd.js` exporting:

- `withTempCwd(fn)` / `withTempCwd(seed, fn)` — mkdtemp a scratch dir (optionally seeded
  by a `seed(dir)` callback), `process.chdir` into it, run `fn`, restore the prior cwd
  and `rmSync` the scratch in `finally`.
- `withTempHome(fn)` — mkdtemp an empty home, point `process.env.HOME` (and
  `process.env.USERPROFILE` for Windows parity) at it, run `fn`, restore and `rmSync`
  in `finally`.

Both accept sync or async `fn` and always restore on throw. A2/A3 use `withTempCwd`;
A4 uses `withTempHome`.

## Consequences

- The restore-in-`finally` guarantee lives in one tested place; call sites cannot
  forget it.
- `engine/test-helpers/` already hosts `capture-io.js`, so the location is conventional.
- New default-resolution or ambient-HOME tests reuse the helper rather than
  re-deriving the dance.
- The helper itself is exercised by the remedied tests; an additional focused unit test
  for the helper's restore-on-throw behaviour is in scope for the plan.
