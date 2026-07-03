---
name: planning
description: Craft phase 4 - produce the parted TDD implementation plan via the planner agent; mechanically linted so every part carries its context block.
---

# craft:planning

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone).
2. Probe: plan directory (`paths.plan`, else `docs/plan/`, create if absent); **design
   doc present?** present → hard input; absent → the planner's mandatory input is the
   resolved brief and it performs its own exploration (slower, never blocked).
3. **Memory read/write surface (advisory).**
   READS: `part-sizing` entries from prior runs as a weak planner hint (no per-use
   re-check; confidence-weighted). Prepended to the planner spawn's injected block when
   non-empty.
   WRITES: none directly from this phase — part sizing is observed at implementation when
   each part's pass/blocked outcome is known.
4. **Intention consult surface (advisory).** The phase receives the intention consult
   slice on slot 1 — the `IntentionView` entries whose subjects intersect this phase's
   change scope, prepended into the same injected contract block as the memory hint (see
   `skills/run/SKILL.md` step 4). An empty slice means the phase probes as today.

## Procedure (default body — a manifest `override:` replaces everything below)

1. Spawn **craft:planner** with: the design doc path (or brief) + the accepted ADR paths; the
   absolute working directory; the output path `<plan-dir>/<slug>.md`; the template
   `"${CLAUDE_PLUGIN_ROOT}/templates/plan.md"`; the part-gate command (manifest
   `gates.part`, or probe: the repo's test runner over touched files, falling back to
   `gates.phase`); the commit message `docs(plan): <slug>`; global + planning-phase
   `context:` files verbatim.
2. When it returns: run `"${CLAUDE_PLUGIN_ROOT}/scripts/plan-lint.sh" <plan-path>` —
   **the phase cannot close red**. On failure, respawn fresh with the lint output; ≤2
   respawns, then escalate.
3. Read the plan; verify part sizing (no test-only parts) and that part contexts
   reference real files/symbols (spot-check). Record in the run record.
