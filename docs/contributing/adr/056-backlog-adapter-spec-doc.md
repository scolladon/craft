# 056 — Backlog adapter procedures live in one referenced spec doc

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P11-backlog-port.md · **Supersedes/Refines:** none

## Context

The per-source `resolve`/`complete` procedures (the `file` mechanism, the `custom` invocation
contract, the gh/jira custom recipes) are prose the session/agent follows. Two seams consume
them: input-classification (`skills/run/SKILL.md` step 2) and the closing tick
(`skills/documentation/SKILL.md` step 2). Where should that prose physically live so it does
not drift?

## Options considered

1. **One adapter spec doc** — `docs/adapters/backlog.md` holds the matrix + recipes; both
   skills reference it. pros: single source of truth (DRY); natural home for a pinned external
   matrix / cons: one more doc to keep in sync with the skills that point at it. *(designer's
   recommendation)*
2. **Inline per-skill** — duplicate the per-source content into both SKILL.md steps. cons: the
   matrix lives in two places and drifts.
3. **Contract clause** — put it in `contracts/delivery.md`. cons: delivery injects into three
   phases but only one ticks; over-loads the bundle.

## Decision

The adapter procedures live in a single new spec doc, **`docs/adapters/backlog.md`**, holding:
the port interface (`resolve`/`complete`), the `file` adapter procedure, the `custom`
invocation contract, and gh + jira as worked `custom` recipes. `skills/run/SKILL.md` and
`skills/documentation/SKILL.md` **reference** it rather than restating the matrix. The
failure-is-a-blocker invariant is NOT restated here — it is referenced from `contracts/core.md`
([[057-backlog-blocker-clause-core]]).

## Consequences

- New file `docs/adapters/backlog.md` (a `docs/adapters/` directory is created).
- `skills/run/SKILL.md` step 2 and `skills/documentation/SKILL.md` step 2 gain a one-line
  pointer to the spec + source-dispatch wiring; they do not carry the full matrix.
- The spec is the single place a future source/recipe is added or corrected.
- Cross-links: the spec cites [[055-backlog-two-source-model]] for the source set and
  [[054-backlog-manifest-object-shape]] for the manifest form.
