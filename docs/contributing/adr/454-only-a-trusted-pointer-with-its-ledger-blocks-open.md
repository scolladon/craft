---
subjects:
  - scripts/run-ledger.sh
  - docs/contributing/specs/run-record.md
---
# 454 — Only a trusted pointer with its ledger blocks open

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/refuse-open-on-live-run-id.md · **Supersedes/Refines:** none

## Context

`open` refuses an open run (ADR-450). "Open" needs one definition. `locate --run` already treats a run as open when its pointer is trusted (`load_trusted_pointer`) and its ledger exists.

## Options considered

1. **A trusted pointer and an existing ledger** *(recommended)* — the predicate `locate --run` uses / pros: one definition of an open run across `open`, `append` and `locate`; an untrusted pointer binds no run, so replacing it destroys nothing live / cons: a live pointer made untrusted by a backwards clock step is replaced (accepted edge)
2. **Any pointer left after the sweep** — pros: three lines smaller; `warn_if_replacing` is deleted / cons: refuses leftovers no run could use

## Decision

Option 1, ratified by the user.

## Consequences

- An untrusted leftover pointer is still replaced, with the existing stderr line naming the replacement.
