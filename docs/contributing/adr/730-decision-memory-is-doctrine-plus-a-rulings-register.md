---
subjects:
  - skills/decisions/SKILL.md
  - docs/contributing/adr
  - templates/adr.md
  - templates/pr-body.md
  - scripts/adr-lint.sh
  - engine/src/adr-lint-main.js
  - scripts/ci.sh
supersedes:
  - adr: "101"
    scope: "the record form: an adopted choice is written as a register line marked Adopted, not as an ADR file"
  - adr: "352"
    scope: "the ADR backfill writer: the decisions phase is the only register writer and may add paths to a path-less line"
  - adr: "355"
    scope: "adr-lint as the whole-corpus hard-blocking gate: rulings-lint replaces it"
  - adr: "566"
    scope: "the adr-lint half of the swap-race pins: adr-lint is retired"
  - adr: "728"
    scope: "the PR body's source: ratified and adopted decisions are read from register lines, not ADR files"
---
# 730 — Decision memory is doctrine plus a rulings register; the ADR corpus retires in this change

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** supersedes ADR-101 (record form), ADR-352 (writer), ADR-355 (gate), ADR-566 (adr-lint pin), ADR-728 (PR body source)

## Context

A spike found doctrine plus one line per settled decision recognises a re-proposed refused option as well as the ADR corpus, at 65% of the tool calls and a 91.5% smaller memory. The probe run before this design, on `opus` with reworded proposals and hand-written lines, gave doctrine plus register 14/14 conflicts caught with 0/10 false alarms, and doctrine alone 10/14 with 1/10.

## Options considered

1. **Introduce and wire the register only; ADRs stay authoritative and are still written** — pros: smallest change / cons: two sources of truth that drift.
2. **Introduce, wire, migrate, and retire the ADR files, `adr-lint` and the supersession machinery in this change** *(recommended)* — pros: one source of truth; the probe's open risks are the same for every variant that reads the register / cons: largest change.
3. **Option 2 minus deleting the ADR files** — pros: files at hand / cons: 1.38 MB of stale second copies in the tree agents grep.

## Decision

Ratified by the user: option 2. craft's decision memory is `DOCTRINE.md` (how to choose) plus the rulings register (what is settled, what was refused, for which paths). This change introduces the register, wires the design, decisions and planning phases to its path slice, migrates every ADR into it by a tested script, and retires `adr-lint`, the supersession frontmatter and the ADR files.

Superseded from ADR-101: the record form — an adopted choice becomes a register line marked `Adopted: <basis>.`, not an ADR file.

Carried forward from ADR-101: adopted choices are still recorded, distinguishable from ratified ones.

Superseded from ADR-352: the ADR backfill writer.

Carried forward from ADR-352: the decisions phase is the only writer of decision memory; a read phase never writes it.

Superseded from ADR-355: `adr-lint` as the whole-corpus hard-blocking gate.

Carried forward from ADR-355: decision memory keeps a hard-blocking lint (`rulings-lint`).

Superseded from ADR-566: the `adr-lint` half of the swap-race pins.

Carried forward from ADR-566: the `trust-hook --check` pin.

Superseded from ADR-728: reading the decisions from ADR files.

Carried forward from ADR-728: the PR body splits ratified from adopted decisions.

## Consequences

- Retrieval misses (a real change scope missing a ruling's paths) stay untested, as for any register variant.
