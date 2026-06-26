---
# Injection point #6 (PRD §7): phases.<id>.harness — tune the AI harness per concern.
# Every knob is optional; defaults are strong. Here the review harness is tuned: fewer cycles,
# an explicit dimension set, stop when only LOW findings remain. All-current.
phases:
  review:
    harness:
      dimensions: [code, security, tests]
      passes: 1
      max_cycles: 2
      convergence: low-only
---

# Example — tuning a harness (`phases.review.harness`)

A **harness** phase (`review`, `validation`, `architecture`, or one you add) exposes a `harness:`
block. The defaults are strong; you tune only what your repo needs. This manifest narrows the
**review** harness to three dimensions, one reviewer pass each, capped at two convergence cycles,
stopping when only LOW findings remain.

| Knob | Meaning | Default | Here |
|---|---|---|---|
| `dimensions` | which review lenses run | `[code, security, tests, perf]` | `[code, security, tests]` |
| `passes` | reviewers per dimension | 1 | 1 |
| `max_cycles` | convergence cap | 3 | **2** |
| `convergence` | stop rule (`low-only` \| `none` \| a number) | `low-only` | `low-only` |

## One home per concern

Harness config is *per concern, per phase* — there is no global "review settings" bucket and no
overlap between phases. Architecture is its **own** standalone harness phase (`phases.architecture.harness`,
default-off), **not** a `review` dimension; validation carries a `techniques` list and a `scope`. The
same `harness:` shape extends to any harness a repo adds (security, performance, accessibility…).

```yaml
phases:
  validation:
    harness:
      scope: per-hunk
      techniques:
        - id: mutation
          run: "npx stryker run --mutate $SCOPE"
          mode: triage
          run-style: background
```

Mis-tuning over- or under-verifies — it never weakens the gate: a harness still gates its phase
whatever its knobs say.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
