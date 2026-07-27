# 159 — Include the ambient-$HOME finding (A4) in scope

- **Status:** accepted
- **Date:** 2026-06-26
- **Design:** docs/design/hermetic-test-suites.md · **Supersedes/Refines:** none

## Context

The audit surfaced a third offender outside the brief's named (a) cwd + (b) repo-file
scope: `engine/test/pipeline-resolve-main.test.js` calls `main([pipelinePath], io)`
without injecting `readUserPolicy`, so the real `defaultReadUserPolicy` reads
`~/.claude/craft-policy.md`. Empirically, 45 of 82 tests in that file flip red when
`$HOME` ships a user policy — the suite is green only by the developer's/CI's HOME
happening to be clean. Same disease (ambient-state coupling), different vector
($HOME, not cwd).

## Options considered

1. **include now** (designer recommendation, flagged for ratification) — pros: same
   defect class, currently exploitable, cheap, zero test-count change, preserves the
   `:1175` no-coverage mutant coverage. cons: widens scope beyond the brief's named
   cwd+repo axis.
2. **defer to a follow-up** — pros: keeps this run strictly within the named brief.
   cons: leaves a known 45/82 latent red in the tree.
3. **leave out of scope permanently** — pros: respects the brief's literal axis. cons:
   abandons a real, proven hermeticity hole.

## Decision

**Include A4 now** (user judgment — ratified scope expansion). Remediate by pointing
`process.env.HOME`/`USERPROFILE` at an empty mktemp home for the file's duration via the
shared `withTempHome` helper (ADR-158), restoring after. The fix keeps
`defaultReadUserPolicy` on its real ENOENT → `{ok:true, policy:{}}` path, so the
`:1175` mutant targets stay killed and no assertion is weakened.

## Consequences

- Hermeticity in this change spans three ambient vectors: cwd (A2), repo files at the
  default location (A2/A3), and `$HOME` (A4) — broader than the brief's named axis but
  one coherent invariant.
- The HOME redirect is file-scoped (`before`/`after`), not per-test, so the
  `EXPECTED_TESTS=1098` count is unchanged.
- Establishes that ambient-HOME coupling is in-scope for the hermeticity invariant the
  guard (ADR-156) defends.
