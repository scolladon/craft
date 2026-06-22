---
# A NORMAL per-pass craft config. The loop lives OUTSIDE craft (it is the operator's
# outer harness — see README.md), so there is NO `loop:` key here: craft runs exactly
# one gated pass per invocation. The only thing this manifest does is point the
# validation phase's DoD probe at the sample checklist next to it.
paths:
  dod: loop/DOD.md
---

# Example — running craft in a loop (a use-pattern, not an injection point)

This dir is the home of the **loop recipe**: an external, operator-owned loop re-invokes
one craft pass against a fixed DoD until the DoD is met. The loop is NOT a craft feature —
craft still runs one gated pass per invocation — so this `workflow.md` carries no loop
config; it is an ordinary manifest whose only job is to declare where the DoD lives
(`paths.dod`). The recipe itself — the canonical `/loop /craft:run` form, the stop
condition, and the headless `craft-pi` contrast — is in **README.md** in this directory.

> In your real repo this file lives at the project root as `.claude/workflow.md`, and the
> DoD file resolves relative to the repo root.
