---
# Injection point (spine): phases.<id>.required — pin a phase so craft's necessity evaluation never
# auto-skips it. The counterpart to the auto-skip story; does not override an explicit skip.
phases: { review: { required: true } }
---

# Example — pin a phase against auto-skip (`phases.<id>.required`)

craft's necessity evaluation can auto-skip a phase it judges unnecessary for the change at
hand (`auto-skip: <phase> — evaluated unnecessary`). Setting `required: true` on a phase pins
it so that evaluation never applies — the phase always runs.

| | without `required` | with this manifest |
|---|---|---|
| `review` phase | may auto-skip if evaluated unnecessary | always runs |

## Does not override an explicit skip

`required: true` beats auto-skip, not the operator. An explicit `pipeline.skip` or
`enabled: false` for the same phase still wins — the operator's own waiver is a stronger
signal than the pinning knob. Setting both `required: true` and a `pipeline.skip` entry for
the same phase is a **manifest-lint error**: the two are contradictory, so lint refuses the
manifest rather than silently picking a winner.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
