# 213 — `craft:tune` is a propose-diff tuner that acts on the miner's output

- **Status:** accepted
- **Date:** 2026-07-04
- **Design:** docs/design/config-tuner.md · **Supersedes/Refines:** none

## Context

`craft:metrics` mines transcripts into `report.json`, but its first consumer — "workflow
improvement" — is hand-run. The brief asks to close that observe→improve loop with a tuner
that keeps observe and act separate (CQS): the miner stays read-only; a new skill maps the
machine-derived signals to a proposed manifest patch and lands it through the existing
emit→lint→land path, never the live `.claude/workflow.md`, never auto-applied.

The manifest vocabulary constrains what a patch can touch: only `models.<role>` and
`pipeline.skip` are knobs that both exist and pass `manifest-lint`. There is no per-phase
`checkpoint` field and no `harness.passes` field, so two of the brief's envelope items
(checkpoint placement, review cadence) have no lint-clean target.

## Options considered

1. **Miner emits a `phase-skip` recommendation; tuner is a pure rec→knob compiler**
   *(chosen)* — the miner already reads every transcript, so counting the `auto-skip:`
   run-record token is one more observation, not an action. The tuner then consumes a single
   surface (`report.json`) and never re-parses transcripts. Cons: a small, redaction-checked
   extension to the observer.
2. **Tuner re-scans transcripts / the PR-body run record itself** — Cons: duplicates
   transcript I/O and containment, couples the tuner to a second text format, and splits
   "who reads transcripts" across two components.
3. **Auto-patch every brief-listed knob** — Cons: `harness.passes` / per-phase `checkpoint`
   are not in the schema, so emitting them yields an un-landable (lint-failing or silently
   ignored) patch. Advisory surfacing is the honest treatment of a signal with no knob.

## Decision

*Adopted-as-recommended (user-confirmed: direct-TDD delivery, full-brief scope incl.
`pipeline.skip`).*

- **Signal detection lives in the miner (CQS preserved).** `skip-signals.js` matches the
  fixed `auto-skip: <phase>` token (ADR-146) and folds it into `phase-skip` recommendations;
  the model-routing rec gains a `role` field so the tuner maps straight to `models.<role>`.
  Markers carry only run + phase — redaction-safe.
- **Two lint-clean auto-patches; everything else advisory.** `model-routing → models.<role>`
  and repeated (`≥2` distinct runs) `phase-skip → pipeline.skip`. `cache-hotspot`,
  `review-waste`, `drift[]`, and recurring high-confidence memory findings surface as
  advisory proposals that alter no frontmatter.
- **Patch an existing named config; propose-diff; land through `init-land`.** The tuner
  resolves a named config two-scope (`config-resolve`), computes the patch in a pure
  `tune-plan.js`, preserves the base prose, and lands only after an explicit human confirm
  through the same lint-then-move bin `craft:init`/`craft:promote-config` use. A lint failure
  lands nothing; `.claude/workflow.md` is never a target.
- **`pipeline.skip` fires only on `auto-skip`** ("didn't need to run"), never on `WAIVER:`
  (operator intent) or `NO-OP(<phase>):` (ran, found nothing), and never for a phase the base
  marks `required: true`.

## Consequences

- The observe→improve loop closes with the miner still read-only; the tuner is a thin,
  deterministic recommendation→knob compiler validated by an SC-style two-run smoke.
- `report.json` gains a fourth recommendation kind (`phase-skip`) and a `role` on
  `model-routing` recs — additive, backward-compatible (the aggregate's new `skipMarkers`
  parameter defaults to empty).
- Checkpoint placement and review cadence stay advisory until the manifest grows a knob for
  them; the tuner will map them the day it does.
- This retires the parked _Repo-local memory hardening (e)_ backlog gap — the tuner is the
  run-over-run improvement loop.
