# 026 — Reorder validation: graph reuse + a separate CQS applicability guard

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P7-pipeline-editing.md · **Supersedes/Refines:** refines ADR-005 (the "same machinery" promise made live)

## Context

Reorder can fail two ways: **ordering** (a consumer placed before its producer) and
**applicability** (an id that is unknown, non-enabled, or duplicated in the list). ADR-005
specified that ordering validity is checked by the *same machinery* as a bad skip — the existing
`validatePipeline → checkEdgesSatisfied` pass, which fires on the post-reorder descriptor list.
The open questions: (1) does reorder get a *duplicate* ordering pre-check, and (2) how do
applicability errors surface from the edit layer back to `resolve.js`?

## Options considered

For ordering: **(A)** reuse `validatePipeline` (no new ordering logic) vs **(B)** a dedicated
reorder ordering pre-check with reorder-flavored messages (duplicates the DAG logic the graph
owns). For the applicability surface: **(a)** `applyReorder` returns an `errors` field (absent on
success); **(b)** `applyReorder` throws, caller try/catches; **(c)** a *separate*
`checkReorderApplicability` query returning an `error[]` (symmetric with `checkStrandedConsumers`),
leaving `applyReorder` a pure `{descriptors, records}` transform.

## Decision

**Ordering: reuse `validatePipeline` (option A).** No duplicate ordering pre-check — a
consumer-before-producer reorder is refused by the existing graph check, exactly as a bad skip is
(the ADR-005 "same machinery" promise, DRY). The generic graph message
(`Descriptor "X": consumes artifact "a" but no earlier enabled descriptor produces it`) is
sufficient; the per-id reorder record lines supply the traceability that connects the edit to the
refusal.

**Applicability: a separate `checkReorderApplicability` guard (option c).** A query function
returns an `error[]` for unknown / non-enabled / duplicate ids, run in `resolve.js` after
`applyInserts` and before `applyReorder`; on errors, the resolver fails fast (`ok: false`).
`applyReorder` stays a **pure positional transform** returning `{descriptors, records}` — symmetric
with its `applyEnableEdits`/`applyInserts` siblings. This honors **CQS** (a guardrail in the repo's
engineering principles): the command (permute) and the query (validate) do not share a return.

**Records: one line per reordered id** — `reorder: <id> (pipeline.reorder)` (DC-B), symmetric with
skip's one-line-per-id and traceable when the graph later refuses (the run record is the
accountability ledger; §11 requires every pipeline edit be logged).

## Consequences

The reorder applicability guard lives beside `checkStrandedConsumers` as a sibling pre-graph query;
the edit-applier family (`applyEnableEdits`/`applyInserts`/`applyReorder`) stays uniformly
command-only. A skip+reorder of the same id is an *applicability* error (the id is non-enabled
after `applyEnableEdits`), caught before the graph — not a graph error. No reorder-specific message
wrapping is added to `graph.js`, so `validatePipeline`'s signature and behavior are untouched (the
surface gate). The resolver gains one more fail-fast branch (`reorder applicability`) between
`applyInserts` and `resolveExecution`.
