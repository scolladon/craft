# 120 — A failed memory save is a warning that never blocks a run; no locking

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P22-repo-local-craft-memory.md · **Supersedes/Refines:** none

## Context

The store is advisory (ADR-116); a failed cache write or a concurrent-run race must never compromise a
green delivery run.

## Options considered

1. **Warning, no lock (last-flush-wins)** *(designer recommendation)* — pros: a missed cache write
   never fails real work. Cons: a concurrent run can lose a flush (costs one re-derivation next run).
2. **Failed save = blocker** — cons: lets an optimization fail real delivery work (against Req 2).
3. **Warning + advisory lockfile** — cons: machinery for a low-stakes race whose worst case is one
   re-derivation.

## Decision

*Adopted as recommended (no user judgment — aligns with ADR-116 / Req 2).* A `save` that cannot
complete is a **recorded warning, never a blocker**; there is **no locking** — concurrent runs are
last-flush-wins. Because entries are advisory and decay-merged, a lost write costs at most one
re-derivation next run, never correctness.

## Consequences

- No lockfile machinery; the only effect of a failed `save` is a run-record warning line.
- Concurrency safety rests on bounded influence (ADR-116), not serialization.
