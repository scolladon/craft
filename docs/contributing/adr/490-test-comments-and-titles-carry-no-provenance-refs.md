---
subjects:
  - test/source-hygiene.test.js
---
# 490 — Test comments and titles carry no provenance refs, pinned without an allowlist

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/provenance-sweep-part-two.md · **Supersedes/Refines:** refines ADR-485

## Context

ADR-485 scoped class E to shipped code and noted that widening it to tests would need a
fixture allowlist first. Over `engine/test`, `test` and `adapters/*/test` the pattern hits 193
lines; a comment/title classifier keeps 48 of them — 46 real provenance, 2 example-data lines
that can be reworded. The other 145 are fixture data the code under test parses or asserts.

## Options considered

1. **Comment-and-title scope, no allowlist** *(recommended)* — pros: empty after the sweep with zero exceptions; matches the contract's "in source or test" / cons: two helpers and six tests; fail-open at non-code extensions (`.md` headings); fails closed on a template-literal fixture line starting `*`/`//`
2. **Whole-line scope plus a fixture allowlist** — cons: 139 data lines across 14 files; file-level entries blind every comment in the two lint suites; goes stale as lines move
3. **Leave tests unguarded** — cons: how 46 lines piled up

## Decision

Option 1 — ratified by user. Class E also scans the test trees (`engine/test`, `test`,
`adapters/*/test`) with ADR-485's base pattern, reporting a row only when it is a comment line
(`//`, `/*`, `*` in `.js`/`.mjs`/`.cjs`/`.ts`; `#` in `.yml`/`.yaml`/`.sh`/`.bash`) or a
line-anchored `test`/`it`/`describe` title. Other extensions are never reported. No allowlist.

## Consequences

A provenance ref in a test comment or title turns ci.sh red. Trailing comments, titles split
over concatenated strings and block-comment continuations without a leading `*` stay unguarded
by design. ADR-485's "widening needs an allowlist first" no longer holds.
