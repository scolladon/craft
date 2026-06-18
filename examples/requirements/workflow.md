---
# Injection point (PRD §7): phases.<id>.enabled — turn ON a default-off phase.
# The requirements phase captures product requirements as a first-class artifact that
# the design phase then consumes as a hard input (ADR-048/ADR-053). All-current.
phases:
  requirements:
    enabled: true
---

# Example — the `requirements` phase

The `requirements` phase is **default-OFF**. Enabling it inserts a
`workspace → requirements → design …` step in the pipeline: the produced doc is
a first-class artifact that the `design` phase reads as a hard input rather than
self-supplying requirements in its own section.

| Phase | default | with this manifest |
|---|---|---|
| requirements | absent | **present** — produces `docs/requirements/<slug>.md` |
| design | present (self-supplies requirements) | present — **consumes** the `requirements` artifact |

> In your real repo this file lives at the project root as `.claude/workflow.md`.
