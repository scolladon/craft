---
name: requirements
description: Craft requirements phase - produce the product-requirements doc via the requirements-writer agent; returns decision candidates for the ADR conversation.
---

# craft:requirements

## Preamble (always runs — non-overridable)

1. `manifest-lint.sh` must pass (skip if the orchestrator already ran it this turn);
   read manifest. Standalone: scope defaults to the current branch vs the default
   branch; establish global-context preconditions against the current checkout root.
2. Probe: requirements docs directory (`paths.requirements`, else `docs/requirements/`,
   create if absent); repo's own requirements template, else
   `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/templates/requirements.md"`.

## Procedure (default body — a manifest `override:` replaces everything below)

1. Spawn **craft:requirements-writer** with: the resolved brief (and any source
   PRD/spec path); the absolute working directory; the output path
   `<requirements-dir>/<slug>.md`; the template; the commit message
   `docs(requirements): <slug>`; the manifest's global + requirements-phase
   `context:` files verbatim.
2. When it returns: READ THE DOC (not the agent's exploration). Sanity-check it
   against the brief; verify the commit exists and the decision-candidates were
   returned.
3. The **`design` phase consumes the produced `requirements` artifact**; record
   the outcome in the run record.
4. Dead agent → respawn fresh from the brief + whatever the doc already contains.
