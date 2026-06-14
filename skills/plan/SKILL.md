---
name: plan
description: Forge phase 4 - produce the sliced TDD implementation plan via the planner agent; mechanically linted so every slice carries its context block.
---

# forge:plan

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone).
2. Probe: plan directory (`paths.plan`, else `docs/plan/`, create if absent); **design
   doc present?** present → hard input; absent → the planner's mandatory input is the
   resolved brief and it performs its own exploration (slower, never blocked).

## Procedure (default body — a manifest `override:` replaces everything below)

1. Spawn **forge:planner** with: the design doc path (or brief) + the accepted ADR paths; the
   absolute working directory; the output path `<plan-dir>/<slug>.md`; the template
   `"${CLAUDE_PLUGIN_ROOT}/templates/plan.md"`; the slice-gate command (manifest
   `gates.slice`, or probe: the repo's test runner over touched files, falling back to
   `gates.phase`); the commit message `docs(plan): <slug>`; global + plan-phase
   `context:` files verbatim.
2. When it returns: run `"${CLAUDE_PLUGIN_ROOT}/scripts/plan-lint.sh" <plan-path>` —
   **the phase cannot close red**. On failure, respawn fresh with the lint output; ≤2
   respawns, then escalate.
3. Read the plan; verify slice sizing (no test-only slices) and that slice contexts
   reference real files/symbols (spot-check). Record in the run record.
