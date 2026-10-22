---
subjects:
  - adapters/codex/src/git-guard-adapter.js
  - adapters/codex/test/fixtures/pre-tool-use-payload.js
  - adapters/codex/test/git-guard-adapter.test.js
supersedes: []
---
# 676 — Codex payload pins name the capture version and the re-confirmation separately

- **Status:** accepted
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/codex-0163-reprobe.md · **Supersedes/Refines:** none

## Context

The committed PreToolUse fixture holds the bytes captured live on codex 0.162.1. On 0.163.0 only
its key set was re-dumped and compared (identical). Two comments and one describe title pin
"0.162.1".

## Options considered

1. **Comments say "captured on 0.162.1; key set re-confirmed on 0.163.0"; the describe title drops
   the version** *(recommended)* — pros: true about the fixture bytes; no title edit per re-probe
2. **Re-pin all three to 0.163.0** — cons: mislabels bytes captured on 0.162.1
3. **Recapture the fixture on 0.163.0** — cons: more work for no behaviour difference

## Decision

The user chose option 1.

## Consequences

The fixture JSON is unchanged. A future re-probe that only compares keys edits the comments, never
the test title.
