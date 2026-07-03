# 202 — Freshness guard is advisory-first with an `intention.gate` knob

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/intention-port.md · **Refines:** ADR-200

## Context

`assert-fresh` produces stale/uncovered findings. How hard should they bite at
introduction? A day-one blocking gate risks re-introducing exactly the ceremony drag the
most recent program (shrink-core-prune-guardrails) worked to remove; a judgment-only DoD
line decorates without guarding.

## Options considered

1. **Advisory drift + `intention.gate: advisory|blocking` knob; deterministic form
   checks gate from day one** (recommended) — pros: consistent with the committed-snapshot
   drift-signal precedent and the guardrail-pruning direction; promotable once tuned /
   cons: an advisory signal can be ignored until someone flips the knob.
2. **Blocking freshness lint day one** — pros: cannot be ignored / cons: ceremony-drag
   risk on an unproven signal.
3. **Judgment-only DoD criterion** — pros: no new mechanism / cons: decorates, does not
   guard.

## Decision

Freshness/coverage findings are advisory by default, emitted as greppable
`INTENTION-DRIFT(<page>): <changed-path>` lines in the run record and PR body, with a
one-line waiver `INTENTION-WAIVE(<page>): <reason>`. A manifest `intention.gate:
blocking` promotes them to a gate. The deterministic form checks (frontmatter validity,
SoT-pointer resolution) gate in `ci.sh` from day one regardless of the knob. **Adopted as
recommended (no user judgment): the session explicitly flagged this as the fork most
open to pushback in the pre-run conversation; the user moved to implementation without
objecting, and it aligns with the drift-signal precedent.**

## Consequences

The `INTENTION-DRIFT`/`INTENTION-WAIVE` tokens join the fixed greppable family
(`NO-OP`, `GATE`, `auto-skip`, `WAIVER`, `POLICY`). Tokens are protocol-level, so every
adapter emits them identically. Promotion to blocking is a manifest edit, not a code
change.
