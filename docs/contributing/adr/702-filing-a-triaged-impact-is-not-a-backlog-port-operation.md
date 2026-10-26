---
subjects:
  - docs/contributing/specs/backlog.md
supersedes: []
---
# 702 — Filing a triaged impact is not a backlog port operation

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** none

## Context

The backlog port has `resolve` and `complete`. Filing never went through it: this repo declares no `backlog:` key, yet runs filed follow-up sections. A port create is not idempotent: a resume between the create call and its ledger line would file twice.

## Options considered

1. **No port operation; the session files against a file-backed target only** *(recommended)* — pros: resume-safe through the ledger and `git log`, no new contract / cons: `custom` trackers get the verdicts in the PR body only
2. **Widen the port with `file(entry)`** (`custom` argv `["file"]`, entry on stdin) — cons: needs a dedupe key the port lacks
3. **Widen it for `file` sources only** — cons: one adapter, no caller needs it

## Decision

Ratified by the user: option 1. Target: `backlog: { source: file, ref }` → `ref`; no `backlog:` key → the root `BACKLOG.md` when it exists, else none; `source: custom` → none. With no target the phase records `NO-OP(impact-triage): no file-backed backlog — verdicts in the PR body only`. The backlog spec gains a Filing section saying so.

## Consequences

Non-file trackers do not receive entries automatically. Revisit only with a dedupe key for create.
