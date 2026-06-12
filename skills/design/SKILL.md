---
name: design
description: Forge phase 2 - produce the feature design doc via the designer agent; returns decision candidates for the ADR conversation.
---

# forge:design

## Preamble (always runs — non-overridable)

1. `manifest-lint.sh` must pass (skip if the orchestrator already ran it this turn);
   read manifest. Standalone: scope defaults to the current branch vs the default
   branch; establish global-context preconditions against the current checkout root.
2. Probe: design docs directory (`paths.design`, else `docs/design/`, create if
   absent); repo's own design template, else `"${CLAUDE_PLUGIN_ROOT}/templates/design.md"`.

## Procedure (default body — a manifest `override:` replaces everything below)

1. Spawn **forge:designer** with: the resolved brief; the absolute working directory;
   the output path `<design-dir>/<slug>.md`; the template; the commit message
   `docs(design): <slug>`; the manifest's global + design-phase `context:` files
   verbatim.
2. When it returns: READ THE DOC (not the agent's exploration). Sanity-check it
   against the brief; verify the commit exists and the Decision-candidates section is
   present (possibly empty).
3. Carry the decision candidates forward to the adr phase. Record the outcome in the
   run record.
4. Dead agent → respawn fresh from the brief + whatever the doc already contains.
