---
# Injection point #2 (PRD §7): models.<agent> — route one phase's agent to a specific model.
# Resolution order is manifest → agent pin → models.fallback → session model; a pinned tier
# that goes down falls back and the degraded tier is remembered for the rest of the run. All-current.
models:
  reviewer: opus
  fallback: sonnet
---

# Example — per-agent model routing (`models`)

`models` maps an agent name to the model it runs on. Here the **review** harness is routed to
`opus` (the deepest reasoning, where a missed defect is expensive) while everything else keeps its
default pin. `models.fallback` names the engine's fallback when a pinned model is unavailable.

| Agent | default | with this manifest |
|---|---|---|
| `reviewer` | its pinned tier | **`opus`** |
| any agent whose pin is down | — | falls back to **`sonnet`**, then the session model |
| every other agent | its pinned tier | unchanged |

## Resolution is a policy the core owns

The Model **port** only exposes `select`/`isAvailable`; the *order* is core policy (§11):
**manifest → agent pin → `models.fallback` → session model**. A pinned tier that goes down does not
fail the run — it falls back, and the **degraded tier is remembered** for the rest of the run so the
run record shows exactly where quality was traded. Routing the wrong tier hurts quality, not safety:
the contract and gates bind regardless of model.

Valid agent keys are the craft agents (`designer`, `planner`, `reviewer`, `slice-implementer`,
`refactor-executor`, `validation-triager`, `docs-writer`, `backlog-ticker`) plus `fallback`.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
