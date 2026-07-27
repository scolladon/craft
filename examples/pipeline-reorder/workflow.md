---
# Injection point (spine): pipeline.reorder — change phase sequence, dependency-checked. Here: run the
# cheaper validation harness before the costly review lens, so a validation failure short-circuits first.
pipeline: { reorder: [validation, review] }
---

# Example — reorder phases (`pipeline.reorder`)

The default pipeline runs `review` before `validation`. This manifest swaps the order so the
cheaper per-hunk `validation` harness runs first — a validation failure short-circuits before
the 4-lens opus `review` spends any tokens.

| | default order | with this manifest |
|---|---|---|
| sequence | `review` then `validation` | `validation` then `review` |
| a validation failure | discovered after `review` already ran | discovered before `review` starts |

## Dependency-safe by construction

The swap is safe because both phases consume only `change` and produce their own report — per
`pipeline/default.yml`, neither depends on the other's output, so reordering them strands no
consumer. A reorder that *would* strand a consumer without a fallback is refused (or flagged,
depending on the violation) rather than silently applied.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
