---
subjects:
  - docs/contributing/adr
  - templates/adr.md
---
# 731 — Retired ADR files are deleted; git history keeps them

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** none

## Context

Once every ADR is migrated into the register, the files are a second, stale copy of each ruling. Spike arm E cited an ADR on 14 of 14 conflicts when the directory was present, so agents read what sits in the tree.

## Options considered

1. **Delete them; git history keeps them** *(recommended)* — pros: one source per ruling, 1.38 MB out of the tree / cons: the text needs `git show`.
2. **Move them to `docs/contributing/archive/adr/`, frozen** — pros: text at hand / cons: a stale second source agents grep.
3. **Leave them in place, frozen** — cons: same as 2, at the old path.

## Decision

Ratified by the user: option 1. `docs/contributing/adr/` and `templates/adr.md` are deleted in this change. An ADR's text is read with `git show <sha>:docs/contributing/adr/<file>`. Dated-tier links to ADR files stay as written.

## Consequences

- Register ids keep the ADR numbers (ADR-732), so every citation still resolves to a line.
