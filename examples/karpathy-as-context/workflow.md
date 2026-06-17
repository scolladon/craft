---
# A behavioral-guideline pack (Karpathy-style) consumed as a GLOBAL craft context file.
# Injection point #8 (PRD §7): `context:` — appended verbatim to every agent invocation
# and every inline run. All-current: works on craft today.
context: .claude/workflow/karpathy-pitfalls.md
---

# Example — Karpathy guidelines as a craft `context:` file

A guideline pack is not a workflow; it is *advice* you want every agent to honor. In craft
that is exactly what a **global `context:` file** is for — the orchestrator appends it
verbatim to every role-agent invocation (and, under `execution: inline`, the session reads
it itself).

Drop the distilled principles in `.claude/workflow/karpathy-pitfalls.md` (here), point
`context:` at it, done. The principles **reinforce** craft's built-in contract (TDD, scope
discipline) rather than fight it — they are additive constraints, never a replacement for
the invariant core (PRD §11).

> In your real repo this file lives at the project root as `.claude/workflow.md`.
