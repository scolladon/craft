---
# Injection point (Ports): policy — a per-repo/per-user permission layer over outward VCS-port
# actions. An explicit `always` verdict supersedes craft's built-in merge/PR confirmation.
policy: { always: [integrate, propose] }
---

# Example — headless auto-merge (`policy`)

`policy:` governs the outward, hard-to-reverse action vocabulary (`isolate`, `commit`, `push`,
`propose`, `integrate`, `teardown`, `external-send`, `backlog-write`). This manifest sets
`always` for `integrate` (merge) and `propose` (pr-create), so both proceed unattended instead
of stopping for confirmation.

| | unconfigured repo | with this manifest |
|---|---|---|
| `integrate` (merge) | defaults to `ask` — stops for confirmation | `always` — proceeds unattended |
| `propose` (pr-create) | defaults to `ask` — stops for confirmation | `always` — proceeds unattended |

## The primary headless form is per-invocation

Editing the manifest is one way to set a verdict, but the primary headless channel is a
per-invocation flag an outer harness passes without touching the file:

```
craft-pi --policy integrate=always --policy propose=always "ship the CSV exporter"
```

Per-invocation is the highest-precedence scope, so a single pre-approved run needs no manifest
edit at all.

## What no verdict can reach

Three engine floors — `never-commit-on-red`, `validation-triage-gates-propose`, and
`artifact-handoff` — are not nameable actions. They are absent from the action vocabulary, so
no verdict, including `always`, can supersede them. Policy governs the outward-action
vocabulary only; it never lowers the invariant core.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
