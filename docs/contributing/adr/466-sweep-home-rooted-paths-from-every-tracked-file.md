---
subjects:
  - docs/contributing/plan
  - docs/contributing/design
  - docs/contributing/archive
  - docs/contributing/adr/035-repo-dir-and-out-of-repo-refs.md
  - docs/contributing/specs/codex-poc-record.md
---
# 466 — Home-rooted paths are swept from every tracked file, archive and ADRs included

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/scrub-home-dir-from-docs.md · **Supersedes/Refines:** refines ADR-135

## Context

83 lines in 31 tracked files carry the maintainer's home directory (slash form `/Users/<name>/…`
and the dashed projects-dir form `-Users-<name>-…`), leaking the OS username and workspace
layout into a public repo. Four of those files sit in the frozen `archive/` tier and one is ADR-035.

## Options considered

1. **Sweep all 31 files, path-only** *(recommended)* — pros: clean HEAD, no guard exemptions / cons: touches frozen records
2. **Freeze `archive/` and ADR-035** — cons: the leak stays at HEAD; the guard carries a 5-path exemption forever
3. **No sweep, stop new leaks only** — cons: an 83-line baseline allowlist forever

## Decision

Option 1, ratified by the user. Every tracked file is rewritten in place, `archive/` and ADRs
included, with the design's substitution table. Only the path prefix changes; decision and
provenance text stay byte-identical (the ADR-135 sweep posture). Git history is not rewritten.

## Consequences

- The original paths remain recoverable from history; the sweep cleans HEAD only.
- No file needs a guard exemption (ADR-467).
