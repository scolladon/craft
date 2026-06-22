# 112 — The canonical loop recipe is Claude Code's `/loop` driving `/craft:run`, paced on the run-record verdict

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P21-loop-recipe.md · **Supersedes/Refines:** none

## Context

Given the loop is an operator-owned harness (ADR-111), the next fork is its *form* and *which craft
entry point* it drives. craft has two entry points (pinned in the design): `/craft:run` — the
interactive Claude Code skill whose final message prints the **full run record** (the complete P20
verify vocabulary: `verify: DoD met` / `verify: … unmet` / `NO-OP(verify):`), but which has **no
process exit code**; and `craft-pi` — the non-interactive bin with a binary exit code (0/2) that
**prints no run record**. The design's first cut centered on a hand-rolled shell `loop.sh` parsing
craft-pi's exit code + stderr. The decisions conversation rejected the shell-script form.

## Options considered

1. **Claude Code `/loop` driving `/craft:run`, self-paced on the printed run record** — Claude (the
   loop's runner) reads `/craft:run`'s run-record verdict each pass and decides stop/continue.
   *(chosen — user judgment)* — pros: no hand-rolled classifier; the loop reads the **actual** P20
   verdict, not a proxy; uses the only entry point that surfaces the full verify vocabulary; `/loop`
   already exists in Claude Code, so the loop is composed, not coded / cons: requires Claude in the
   loop (not fully headless — that is ADR-113's variant).
2. **A committed shell `loop.sh` driving `craft-pi`** — cons: hand-rolls a classifier over an
   impoverished signal (binary exit + best-effort stderr; no run record); ships shell to lint/test;
   the user explicitly ruled "it should not be a script."
3. **`/craft:run` driven manually by a human re-issuing it** — cons: not a *loop* in any composable
   sense; no self-pacing.

## Decision

The **canonical** recipe is **Claude Code's `/loop` slash command driving `/craft:run`**, omitting
the interval so the model **self-paces**: each iteration runs one `/craft:run` pass, then the model
reads the pass's **printed run record** and applies the stop condition — stop on `verify: DoD met`
(with no `verify: … unmet`), continue on a `verify: … unmet` outcome, surface-and-halt on any other
blocker or a `NO-OP(verify):` premise violation (ADR-114). It is **not a shell script**; it is a
documented use of an existing Claude Code primitive composed over an existing craft entry point.

`/craft:run` is chosen precisely because it is the **only** entry point that prints the run record —
so the loop reads the real DoD verdict rather than inferring it from an exit code. The fully-headless
case (no Claude in the loop) is the documented contrast in ADR-113, not the canonical path.

## Consequences

- The central honesty problem of the script-first design dissolves: with the run record visible, the
  model reads `verify: DoD met` directly — no exit-code/stderr classifier, no DoD-presence trick is
  needed on this path (it is still needed on the headless path, ADR-113).
- The loop inherits `/loop`'s own semantics (self-pacing, the operator can set an interval or a
  bound; ADR-114 fixes the stop/bound policy the recipe documents).
- The recipe must show the exact `/loop` invocation and the stop-condition the model applies, in
  prose a reader can copy (the example's README + the GUIDE section, ADR-115).
- A reader who needs unattended CI without Claude is routed to the craft-pi contrast (ADR-113).
