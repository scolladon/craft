---
subjects:
  - test/source-hygiene.test.js
---
# 467 — A source-hygiene class blocks home-rooted paths across the tracked tree

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/scrub-home-dir-from-docs.md · **Supersedes/Refines:** none

## Context

The same leak recurred in 19 plans run after run with nothing checking it. `prose-lint` is
advisory, touched-diff only, and excludes the design/plan/ADR/archive trees, so it cannot carry
the check. A `$HOME`-derived match never fires on CI, whose runner home appears in no file.

## Options considered

1. **Class D in `test/source-hygiene.test.js`, shape-based match** *(recommended)* — pros: whole tree, blocking locally and on CI, no new bin / cons: a fixed placeholder allowlist
2. **New engine bin + `static-lints.sh` line** — cons: bin, shim and suite only pay off if shipped to user repos
3. **`$HOME`-derived literal** — cons: blind on CI and on any other contributor's machine

## Decision

Option 1, ratified by the user. A new class in `test/source-hygiene.test.js` fails on any tracked
line holding a home root at a path start — `/(Users|home)/<seg>` or the dashed
`-(Users|home)-<seg>-` — whose segment is neither a `<…>` placeholder nor in the fixed
placeholder set (`alice`, `example`, `me`, `someone`, `user`, `x`, `other-clone`). No waiver token.

## Consequences

- A real user named like a placeholder is missed; accepted.
- Windows `C:\Users\…` shapes are not covered (zero occurrences).
- Leak-shaped test inputs are built at runtime from parts, so the scanned suite holds no literal leak.
