---
# Injection point #1 (PRD §7): pipeline.skip — drop a phase from the run.
# Dependency-checked: a skip that would strand a consumer-without-fallback is refused at
# resolution (SC3), so you can't silently erode a guarantee. All-current.
pipeline:
  skip: [refactoring]
---

# Example — skipping a phase (`pipeline.skip`)

`pipeline.skip` removes a phase from the walk. It is the cheapest customization — one line — and
the engine still protects you: the resolver checks the **dependency graph** before honoring a skip.
A skip that strands a downstream consumer *without a fallback* is **refused** (`pipeline-resolve`
→ `ok: false`), not silently applied (**SC3**). Skipping a leaf like `refactoring` (no phase
*consumes* its output) is safe and resolves clean.

| | default | with this manifest |
|---|---|---|
| `refactoring` | present (behavior-preserving structure pass) | **skipped** — recorded in the run record |
| every other phase | present | present, unchanged |

## Skip is honest, not silent

Two guarantees hold around a skip:

- **Dependency-aware** — `skip: [design]` would strand `planning` (which *consumes* design) and is
  refused unless the consumer can self-supply. The engine knows "plan consumes design," not "design
  precedes plan," so it rejects exactly the skips that break a real data dependency.
- **Recorded** — every skip lands in the run record (§11). Flexibility comes *with visible
  accountability*; a reviewer can always see which phases the run dropped and why.

## Per-invocation — no manifest at all

The same switch rides as a flag, folded over the manifest at highest precedence:

```
/craft:run --skip refactoring "tidy the CSV exporter"
```

> In your real repo this file lives at the project root as `.claude/workflow.md`.
