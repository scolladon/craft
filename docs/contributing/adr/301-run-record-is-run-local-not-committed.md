# 301 — The run-record ledger is run-local, not committed

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** refines 300 (ledger file shape); departs from the committed-artifact posture of 118/119

## Context

The memory store and the metrics file are both committed, on the rationale that state should
travel with the repo. The run record could follow that precedent. But unlike those two, the
run record is written on every phase boundary of every run, so committing it puts a growing
ledger diff into every craft PR — including PRs whose subject has nothing to do with it.

## Options considered

1. **Committed via a `.gitignore` re-include, beside memory and metrics** *(recommended by the design)* — pros: matches 118/119; survives worktree teardown / cons: ledger diff noise in every craft PR.
2. **Gitignored — run-local, dies with the worktree** — pros: zero diff noise; zero `.gitignore` change, since `.claude/*` is already ignored with explicit re-includes / cons: the ledger does not survive `worktree-teardown.sh`.
3. **Committed from the documentation phase onward** — pros: less noise / cons: leaves the early phases, where a reset is most expensive, unprotected.

## Decision

**Ratified by the user against the design's recommendation.** The ledger is run-local: it is
not re-included in `.gitignore`, so the existing `.claude/*` ignore rule covers it and no
gitignore change ships. The protection it buys is scoped to a context reset within a live
worktree — not to worktree destruction.

## Consequences

No `.gitignore` edit is in scope. The resume story is "a reset inside the worktree recovers
the ledger", not "the ledger outlives the tree" — the design's requirements are narrowed to
match, and any wording promising cross-teardown durability is wrong. `worktree-teardown.sh`
is unaffected and needs no ledger-preservation step.

The memory `delta` derived from the ledger (303) needs one ordering constraint this decision
creates. `Done` runs after the whole phase walk, and the walk's last phase tears the worktree
down — so `save` fires after the ledger's file is gone. The derivation must therefore read the
ledger at the last pre-teardown boundary and hold the delta; `save` itself stays one atomic
call at `Done`, unweakened. A consequence of that split: the ledger's on-disk tail ends at the
last pre-teardown boundary, so the final phase's line and anything `Done` appends exist
in-session only.
