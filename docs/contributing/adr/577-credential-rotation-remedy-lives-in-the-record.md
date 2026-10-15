---
subjects:
  - docs/contributing/specs/codex-poc-record.md
---
# 577 — The realised credential rotation and its remedy live in the codex POC record

- **Status:** accepted
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/codex-0162-reprobe.md · **Supersedes/Refines:** none

## Context

The 0.162.1 probe's copied `auth.json` returned HTTP 401: the 0.145.0 probe had consumed the refresh
token, leaving the operator's real copy stale. Logging in inside the throwaway `CODEX_HOME` gave a
working credential without touching the real home. `adapters/README.md` *Probe records* already
states the rotation caveat as a standing rule.

## Options considered

1. **Record only: one row in the 0.162.1 section and one sentence in the caveat section** — pros:
   minimal; the record is the worked example the rule points at / cons: the remedy stays
   codex-specific. *(designer's recommendation)*
2. **Also add a fourth mitigation to `adapters/README.md`** — pros: the remedy sits in the rule /
   cons: not every binding can log in inside a throwaway (cursor's auth is keychain-bound).
3. **A new BACKLOG entry generalising the remedy** — pros: tracked / cons: no proven need beyond
   codex.

## Decision

Option 1, adopted-as-recommended (no user judgment): the smallest change that records the observed
fact. The codex POC record carries the realised rotation and the login-inside-throwaway remedy.

## Consequences

- `adapters/README.md` is unchanged.
