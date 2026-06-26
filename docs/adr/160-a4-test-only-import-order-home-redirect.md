# 160 — A4 remedied test-only via import-order $HOME redirect (no production change)

- **Status:** accepted
- **Date:** 2026-06-26
- **Design:** docs/design/hermetic-test-suites.md · **Supersedes/Refines:** refines ADR-158, ADR-159

## Context

ADR-158/159 prescribed neutralizing A4's ambient `$HOME` via the shared helper's
`withTempHome`/`enterTempHome` in a file-scoped `before()`/`after()`. Implementation
revealed that premise was false: `engine/src/pipeline-resolve-main.js` captured
`homedir()` in **module-level constants** (`USER_POLICY_ROOT`/`USER_POLICY_PATH`),
evaluated when the module is imported. A `before()` hook runs *after* module evaluation,
so redirecting `$HOME` there is too late — the path is already fixed. Making the reader
compute its path lazily would fix this and is behavior-preserving, but it is a change to
production source, which the brief's NON-GOAL forbids ("only make the TESTS hermetic").

## Options considered

1. **lazy-homedir production change** + test `before`/`after` — pros: cleanest test code;
   arguably fixes a latent module-load-capture hazard. cons: edits production source
   against the explicit non-goal.
2. **test-only import-order redirect** — a side-effecting `engine/test-helpers/empty-home.js`
   imported *before* the module under test redirects `$HOME` at import time. pros: zero
   production change; honors the non-goal. cons: relies on ESM import ordering and an
   import-for-side-effect module.
3. **defer A4** — pros: strictly tests-only via A2/A3 only. cons: leaves the proven 45/82
   ambient-`$HOME` fragility unfixed; re-opens ADR-159.

## Decision

Adopt **option 2** (user-ratified). `engine/test-helpers/empty-home.js` `mkdtemp`s an empty
home and points `process.env.HOME` + `USERPROFILE` at it **at import time**, exporting
`restoreEmptyHome()` (restores both env vars, `rmSync`s the dir).
`engine/test/pipeline-resolve-main.test.js` imports it as its **first** import — before
`../src/pipeline-resolve-main.js`, so the production module captures the empty home when it
evaluates — and tears it down in an `after()`. No production source changes.

`engine/test-helpers/with-cwd.js` is consequently scoped to **cwd-only**: `withTempHome`
and `enterTempHome` (named in ADR-158) are removed as unused; `withTempCwd` (+ internal
`enterTempCwd`) remains for A2/A3. The change is net count-neutral: the two `withTempHome`
unit tests are replaced by two `empty-home` unit tests.

## Consequences

- Production `pipeline-resolve-main.js` is untouched; cwd/HOME-relative resolution stays a
  consumer feature exactly as shipped.
- The `:1175` no-deps coverage stays live: the real `defaultReadUserPolicy` still runs and
  hits its ENOENT → `{ok:true, policy:{}}` path against the empty home — no assertion
  weakened, no stub reader injected.
- The fix depends on ESM import ordering (`empty-home.js` before the module under test);
  the durable guard (ADR-156) — the repo-root bats smoke and the second ci.sh run —
  defends it. `node --test` runs each file in its own process, so the env restore in
  `after()` is belt-and-suspenders; the `rmSync` prevents temp-dir leak.
- Supersedes the `withTempHome`/`enterTempHome` API of ADR-158 and the `before/after`
  wiring detail of ADR-159; the in-scope decision of ADR-159 stands.
