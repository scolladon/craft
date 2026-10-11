---
subjects:
  - engine/src/stub-lint-main.js
---
# 474 — stub-lint exempts its own name token, never a whole file

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/stub-lint-ci-self-reference.md · **Supersedes/Refines:** refines ADR-210

## Context

`stub-lint` reports `STUB` on `scripts/ci.sh:121`, the line that invokes it: `-` is a word
boundary, so `stub` inside `stub-lint.js` matches the case-insensitive marker rule. The
finding is self-reference noise, advisory today and blocking under `hygiene.gate: blocking`.
A real marker added to `ci.sh` must still be caught.

## Options considered

1. **Token rule**: the name `stub-lint` is stripped from each line before matching *(recommended)* — pros: per-token, a real marker on the same line or file still fires / cons: one more pattern in the stub module
2. **Path exemption** of `scripts/ci.sh` beside `ctx.self` — cons: skips the whole file, hiding a real `# TODO: x`; hard-codes one repo path into the shared core
3. **`STUB-WAIVE(scripts/ci.sh)`** — cons: skips the whole file; only read from a touched `.md`, so it must be re-supplied on every `ci.sh` change

## Decision

Option 1 — ratified by the user. The lint's own name is not a marker; the exemption is a
token, never a line or a file. Every other occurrence of a marker is still reported.

## Consequences

- `ci.sh:121` and any other line naming `stub-lint` stop firing; `# TODO: x` and
  `# stub: fill in` in `ci.sh` still fire.
- `engine/bin/stub-lint.js:3` and `engine/src/hygiene-lint-core.js:2` stop firing too.
