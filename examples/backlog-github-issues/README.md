# backlog-github-issues — named tracker adapter example

This example registers a named backlog adapter via `extends.backlog-adapters`, enabling
`backlog.source: github-issues` in the manifest.

## What this shows

| File | Role |
|---|---|
| `workflow.md` | Manifest fragment: `extends.backlog-adapters` registration + `backlog.source` selection |
| `resolve.sh` | Resolver script implementing `resolve <id>` and `complete <id> <refs...>` |

## How it works

1. `extends.backlog-adapters` registers a named adapter entry (`name: github-issues`) with a
   `ref` pointing to `resolve.sh`. The `ref` is verified at lint time.
2. `backlog.source: github-issues` selects the registered adapter for this manifest.
3. At runtime, craft invokes `resolve.sh resolve <id>` or `resolve.sh complete <id> <refs...>`.

## Using this in your repo

1. Copy `resolve.sh` to your repo (e.g. `.claude/workflow/my-tracker.sh`).
2. Ensure the host CLI is installed and authenticated.
3. Add to your `.claude/workflow.md`:

   ```yaml
   backlog:
     source: my-tracker
   extends:
     backlog-adapters:
       - name: my-tracker
         ref: .claude/workflow/my-tracker.sh
   ```

4. Validate: `bash scripts/manifest-lint.sh` (or `node engine/bin/manifest-lint.js .claude/workflow.md`).

## Security

The adapter script validates `id` against the id-form allowlist (`^#?[0-9]+$`) before any
tool call and passes `id` as a discrete argv element — never interpolated into a shell string.

See [`docs/contributing/specs/backlog.md`](../../docs/contributing/specs/backlog.md) for the full port contract
and safe-invocation guidelines.
