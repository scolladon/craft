---
# Injection point (Ports): intention — a per-repo architectural-intention corpus. `consult` prepends
# matching living pages into the design/planning contract; `assert-fresh` flags drift; start advisory.
intention: { source: file, gate: advisory, covers: ["engine/src/**"] }
---

# Example — living-intention corpus (`intention`)

The `file` intention corpus consults your repo's living pages — any doc that declares
`subjects: [<globs>]` in its own frontmatter — and folds the matching ones into the
design/planning contract. This manifest also declares `covers`, a set of scopes that must be
governed by at least one page's subjects.

| | unconfigured repo | with this manifest |
|---|---|---|
| `consult` | probes the conventional corpus zero-config | prepends matching living pages into the design/planning contract slot (advisory) |
| `assert-fresh` | no `covers` declared → `uncovered` is always `[]` | flags `engine/src/**` as uncovered if no page's subjects match it |
| gate | — | `advisory` — findings print, run stays green |

## Drift and waiver

`assert-fresh` flags a changed scope whose covering page went untouched as
`INTENTION-DRIFT(<page>): <changed-path>`. A page's staleness can be acknowledged with
`INTENTION-WAIVE(<page>): <reason>` in the change's design doc or PR body — a waived page never
emits drift.

## Start advisory, promote once populated

`gate: advisory` (the default) prints findings but stays green; `gate: blocking` promotes
drift and coverage findings to a hard stop. Promote only once the corpus is populated — a
blocking gate over a thin corpus stalls on false positives from pages that don't exist yet.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
