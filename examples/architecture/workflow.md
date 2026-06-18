---
# Injection point (PRD §7): phases.<id>.enabled — turn ON a default-off phase.
# The architecture phase runs dependency-cruiser over the change and triages violations;
# its triage gates the PR alongside validation. No-ops with a note if no depcruise config
# exists yet, so it is safe to enable mid-adoption (ADR-049/ADR-050). All-current.
phases:
  architecture:
    enabled: true
---

# Example — the `architecture` phase

The `architecture` phase is **default-OFF**. Enabling it runs dependency-cruiser over
the change after `change` exists, and its triage gates `propose` alongside `validation`.
If no dependency-cruiser config exists yet the phase **no-ops with a note** in the run
record — safe to enable mid-adoption without breaking the pipeline.

| Phase | default | with this manifest |
|---|---|---|
| architecture | absent | **present** — runs depcruise; no-ops with a note when no config exists |
| propose | present | present — **gated** on architecture triage alongside validation |

> In your real repo this file lives at the project root as `.claude/workflow.md`.
