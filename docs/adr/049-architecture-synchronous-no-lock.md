# 049 — `architecture` harness runs synchronously, no lock

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P10-default-phases.md · **Supersedes/Refines:** Refines ADR-036 (`.craft-mutation.lock` naming — NOT cloned here)

## Context

The default-off `architecture` phase is an executing harness (contract `[harness-exec]`,
tool `dependency-cruiser`). The existing executing harness, `validation`, runs its tool
(mutation) **in the background** and writes `.craft-mutation.lock` so `worktree-teardown.sh`
refuses while the slow run is live. dependency-cruiser is a fast static check, not a slow
mutation grind — so the background+lock machinery may be unnecessary.

## Options considered

1. **Synchronous, no lock** — pros: matches the tool's speed; no lock/teardown race to
   manage; the propose-gate still holds via `harness-exec` + `awaitingHarnesses` / cons:
   blocks the thread for the (short) run. *(designer's recommendation)*
2. **Background run + a new `.craft-arch.lock`** — pros: parallels validation exactly /
   cons: needless machinery for a fast check; a second lock to teach teardown about.
3. **Synchronous but reuse `.craft-mutation.lock`** — pros: one lock name / cons: collides
   with mutation's lock semantics; teardown can't tell which harness holds it.

## Decision

`architecture` runs dependency-cruiser **synchronously** and writes **no lock**. The
`propose` gate still waits for architecture's triage because the resolver adds any
`harness-exec` phase to `propose.awaitingHarnesses` (S5 proves this) — the gate semantics
are independent of background-vs-sync. `skills/architecture/SKILL.md` therefore omits
validation's background-run, lock-write, and "never destroy the worktree while the run is
alive" clauses.

## Consequences

- `skills/architecture/SKILL.md` is strictly simpler than `skills/validation/SKILL.md`:
  no `.craft-mutation.lock`, no background dispatch.
- ADR-036's lock stays mutation-specific; `worktree-teardown.sh` is unchanged.
- If a future tool under the architecture concern is slow, revisit (a per-tool decision,
  not a phase-wide one).
