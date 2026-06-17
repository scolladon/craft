---
# A topology preset: run the cheap, judgment-fused phases IN-THREAD (no subagent),
# isolate only the heavy code-producer and the harnesses. Injection point #4 (PRD §7):
# `execution:` / `profile:`. All-current: works on forge today.
pipeline:
  profile: lean
---

# Example — the `lean` execution profile

`execution:` governs whether a phase delegates to a subagent (`agent`, the default) or runs
**in the session's own thread** (`inline` — no spawn round-trip, no duplicated context). A
**profile** sets it en masse. `lean` is the middle preset between `solo` (all-inline) and
`full` (all-agent):

| Phase | `lean` |
|---|---|
| workspace · design · decisions · planning | **inline** |
| implementation | `agent` — isolate the heavy TDD producer |
| review · validation | `agent` — harnesses always stay `agent` (parallel dimensions) |
| refactoring | `agent` |
| documentation · propose · integrate | **inline** |

The trade: inline saves the spawn round-trip (speed) and the subagent context duplication
(tokens), at the cost of **isolation**. So `lean` keeps `agent` exactly where isolation pays —
the code-producing `implementation`, the `refactoring` pass, and the multi-dimension harnesses
(which also need `agent` to fan out their dimensions in parallel — that caveat binds under
*every* profile).

## Profiles are sugar — `lean` is two lines without a name

A named profile adds no capability the per-phase `execution:` precedence
(**`phases.<id>.execution` > `profile` > top-level `execution:`**) can't already express.
`profile: lean` is exactly:

```yaml
pipeline:
  execution: inline                 # everyone inline by default…
phases:
  implementation: { execution: agent }   # …isolate the heavy TDD producer
  refactoring:    { execution: agent }    # …and the refinement pass
# review + validation auto-stay agent (the harness parallelism caveat) — nothing to write
```

Use the name for convenience; reach for the per-phase form when you want a mix no preset names.

## Per-invocation — no manifest at all

`/forge:run` accepts the same switch as a flag, folded over the manifest at highest precedence:

```
/forge:run --profile lean "add a CSV export to the report page"
```

> In your real repo this file lives at the project root as `.claude/workflow.md`.
