---
# Named tracker adapter via extends.backlog-adapters.
# Register the adapter under a recognizable name; select it as backlog.source.
# The ref script is verified at lint time; the host CLI is invoked at runtime.
backlog:
  source: github-issues
extends:
  backlog-adapters:
    - name: github-issues
      ref: ./backlog-github-issues/resolve.sh
---

# Example — named tracker adapter (`extends.backlog-adapters`)

A **named backlog adapter** registers a custom resolver under a recognizable name via
`extends.backlog-adapters`, then selects it as `backlog.source`. The `ref` field points to
the resolver script that implements the `resolve`/`complete` contract; the script is checked
at lint time and invoked at runtime.

Compare with the raw `source: custom` escape hatch in [`backlog-custom/`](../backlog-custom/):
a named adapter registers a stable name that the manifest can select without embedding a script
path directly in `backlog.ref`, and it is addressable as a first-class source name.

## How it resolves

| | `source: file` (default) | `source: custom` | `source: github-issues` (this) |
|---|---|---|---|
| `resolve(id)` | reads the markdown backlog entry | runs the `ref` script | runs the registered adapter script |
| `complete(id, refs)` | ticks the checkbox, appends refs | runs the `ref` script | runs the registered adapter script |
| ref checked at lint | file must exist | any non-empty string | adapter `ref` must exist |

## The adapter script contract

The resolver script at `ref` implements two argv commands:

- `resolve <id>` — print `{ title, brief }` on stdout; blocker on id-not-found
- `complete <id> <refs...>` — mark the item done and append refs; exit 0 = success

**Safe invocation:** `id` is passed as a discrete positional argument (never interpolated into a
shell string), and validated against an id-form allowlist before any tool call.

See [`resolve.sh`](./resolve.sh) for the complete implementation and [`docs/contributing/specs/backlog.md`](../../docs/contributing/specs/backlog.md)
for the full port specification.

## The `extends.backlog-adapters` sub-block

```yaml
extends:
  backlog-adapters:
    - name: <source-name>        # selectable as backlog.source: <source-name>
      ref: <path-to-script>      # path to the resolver script; must exist at lint time
```

One entry per adapter; the name must be unique across the registration set. Multiple adapters
can be registered in one manifest.

## In your real repo

In your project the file lives at `.claude/workflow.md` and the adapter script lives wherever
you place it (e.g. `.claude/workflow/my-tracker.sh`). The `ref` path resolves relative to your
repo root.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
