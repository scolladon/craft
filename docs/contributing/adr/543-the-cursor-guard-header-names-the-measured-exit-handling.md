---
subjects:
  - adapters/cursor/hooks/craft-guard.js
---
# 543 — The cursor guard header names the measured exit handling

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/cursor-hook-nonzero-exit-probe.md · **Supersedes/Refines:** none

## Context

The guard's header comment says Cursor ignores a stray exit code. The live probe on cursor-agent 2026.07.20-8cc9c0b disproves it: exit 2 denies whatever `failClosed` says, and under `failClosed: true` exit 1, exit 127 and a SIGKILL death all block the call. The POC record's falsified **Deny wire** row is corrected in place anyway (ADR-320); the question was whether prose outside the record changes too.

## Options considered

1. **Record and BACKLOG only** — cons: a proven-false claim stays in the comment that tells a reader what not to change
2. **Correct the guard header, comments only** *(recommended)* — replace the false sentence and name the measured classes in the `failClosed` layer
3. **Option 2 plus a README sentence** — cons: the README bullet is true as written; the record and the header already carry the detail

## Decision

Ratified by the user: option 2. The header stops claiming exit codes are ignored, and its `failClosed` layer names exit 1 (an import that fails to load), exit 127 and a SIGKILL as measured blocks. No executable line changes.

## Consequences

The guard's behaviour, `hooks.json` and `config.template.json` are unchanged. `adapters/cursor/README.md` is not edited.
