---
# Injection point (PRD §7): phases.<id>.enabled — turn ON a default-off phase.
# The architecture phase runs the declared technique's own `run` command and triages
# violations; its triage gates the PR alongside validation. No-ops with a note if the
# technique's probe fails, so it is safe to enable mid-adoption (ADR-049/ADR-348). All-current.
phases:
  architecture:
    enabled: true
    harness:
      techniques:
        - id: dependency-cruiser
          probe: "test -f .dependency-cruiser.json"
          run: "npx depcruise --config .dependency-cruiser.json $SCOPE"
          mode: triage
---

# Example — the `architecture` phase

The `architecture` phase is **default-OFF**. Enabling it runs dependency-cruiser over
the change after `change` exists, and its triage gates `propose` alongside `validation`.
If no dependency-cruiser config exists yet the phase **no-ops with a note** in the run
record — safe to enable mid-adoption without breaking the pipeline.

| Phase | default | with this manifest |
|---|---|---|
| architecture | absent | **present** — runs depcruise via `dependency-cruiser` technique; no-ops with a note when probe fails |
| propose | present | present — **gated** on architecture triage alongside validation |

> In your real repo this file lives at the project root as `.claude/workflow.md`.
