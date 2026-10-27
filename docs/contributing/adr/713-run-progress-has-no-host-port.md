---
subjects:
  - engine/src/run-progress.js
---
# 713 — Run progress has no host port

- **Status:** accepted
- **Date:** 2026-10-27
- **Design:** docs/contributing/design/run-visibility-task-list.md · **Supersedes/Refines:** none

## Context

The view is pull-only: nothing in the walk calls it. Other hosts (pi, codex, copilot, cursor, aider, antigravity) have no task list craft could drive.

## Options considered

1. **No port: the pure `projectProgress(lines, runId)` is the seam; the Claude module is its only reader** *(recommended)* — pros: no living-corpus page with one live binding / cons: none beyond a later spec if a second host appears
2. **A `Progress` port spec with "none" rows for other hosts** — cons: documents absence
3. **Port spec plus a pi TUI binding now** — cons: outside the Claude Code scope

## Decision

Option 1, ratified by the user. Another host binds by importing `projectProgress`.

## Consequences

No spec under `docs/contributing/specs/` for progress; the run-record spec names `run-progress` as the ledger's derived-view reader.
