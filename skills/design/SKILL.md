---
name: design
description: Craft phase 2 - produce the feature design doc via the designer agent; returns decision candidates for the ADR conversation.
---

# craft:design

## Preamble (always runs — non-overridable)

1. `manifest-lint.sh` must pass (skip if the orchestrator already ran it this turn);
   read manifest. Standalone: scope defaults to the current branch vs the default
   branch; establish global-context preconditions against the current checkout root.
2. Probe: design docs directory (`paths.design`, else `docs/design/`, create if
   absent); repo's own design template, else `"${CLAUDE_PLUGIN_ROOT}/templates/design.md"`.
3. If a `requirements` artifact was produced this run, treat it as a hard input (read
   it, design against it); else self-supply requirements in the design doc's own section.
4. **Intention consult surface (advisory).** The phase receives the intention consult
   slice on slot 1 — the `IntentionView` entries whose subjects intersect this phase's
   change scope, prepended into the injected contract block alongside the memory hint
   (see `skills/run/SKILL.md` step 4). An empty slice means the phase probes as today.

## Procedure (default body — a manifest `override:` replaces everything below)

1. Spawn **craft:designer** with: the resolved brief; the absolute working directory;
   the output path `<design-dir>/<slug>.md`; the template; the commit message
   `docs(design): <slug>`; the manifest's global + design-phase `context:` files
   verbatim.
2. When it returns: READ THE DOC (not the agent's exploration). Sanity-check it
   against the brief; verify the commit exists and the Decision-candidates section is
   present (possibly empty).
3. Carry the decision candidates forward to the decisions phase. Record the outcome in
   the run record.
4. Dead agent → respawn fresh from the brief + whatever the doc already contains.
