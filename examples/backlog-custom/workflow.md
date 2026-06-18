---
# Injection point #7 (PRD §7): backlog.{source,ref} — point craft at your tracker.
# Two built-in sources: `file` (the default markdown backlog) and `custom` (a resolver script you
# supply). gh / jira / linear are `custom` recipes, not built-ins. All-current.
backlog:
  source: custom
  ref: ./scripts/your-tracker.sh
---

# Example — a custom backlog source (`backlog`)

The **Backlog SoT** port has two operations — `resolve(id) → {title, brief}` and
`complete(id, refs[])` — and two built-in sources: `file` (a markdown backlog, the zero-config
default) and `custom` (a script you supply). This manifest routes both operations through
`./scripts/your-tracker.sh`; GitHub Issues, Jira, and Linear are written as **`custom` recipes**
(see [`docs/adapters/backlog.md`](../../docs/adapters/backlog.md)), not first-class sources.

| | `source: file` (default) | `source: custom` (here) |
|---|---|---|
| `resolve(id)` | reads the markdown backlog entry | runs your script: `your-tracker.sh resolve <id>` |
| `complete(id, refs)` | ticks the checkbox, appends refs | runs your script: `your-tracker.sh complete <id> <refs>` |
| ref checked at lint | the file must exist | any non-empty string (resolved at runtime) |

## The core owns *when*, your script owns *how*

The port exposes only `resolve`/`complete`; the core keeps the policy — *which id-form is a backlog
id*, and *when the closing tick fires* (after the PR exists, on delivery). Your script just answers
the two calls. And **adapter failure is a blocker, never a silent pass** (§11): if `resolve` or
`complete` cannot reach your tracker, the run escalates via the blocker protocol — the closing tick
is never silently skipped.

A real `custom` recipe (e.g. a `gh issue` round-trip) needs credentials and mutates a tracker, so
it is exercised empirically + by prose, not in CI. A first-class per-tracker *adapter* (vs. this
repo-script escape hatch) rides with the P14 derived-plugin surface.

> In your real repo this file lives at the project root as `.claude/workflow.md`, and
> `your-tracker.sh` is a script in your repo.
