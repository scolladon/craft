# 210 — Stub-marker pre-completion gate over touched source

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/harness-hygiene-prune-gates.md
- **Scope:** workstream C1

## Context

Nothing mechanically catches leftover TODO/FIXME/stub markers in code shipped by a craft
run. The `intention-lint` precedent (bin shim + src module + argv-of-paths) is the
template.

## Options considered

1. **`engine/bin/stub-lint.js` shim + `engine/src/stub-lint-main.js`, over the branch-diff
   touched source** (recommended) — pros: mirrors `intention-lint` exactly; src is
   mutation-scoped / cons: a new bin+module pair.
2. **A `scripts/*.sh` grep** — pros: less code / cons: unmutated, diverges from the
   engine-bin house pattern.

## Decision

A stub gate matching `TODO FIXME HACK XXX PLACEHOLDER STUB` (case-insensitive,
word-boundary) runs over the touched **source** set. `ci.sh` computes the touched set (git
diff vs the base) and passes it as argv (C3-set); the gate lives as
`engine/bin/stub-lint.js` + `engine/src/stub-lint-main.js` (C2-home). **Ratified: the
marker set (C1). Adopted as recommended: home and touched-set source.** A
`STUB-WAIVE(<marker>)` prose token waives a specific finding — never an inline suppression
directive (the no-suppression floor).

## Consequences

Leftover stubs surface in the run record. Advisory by default (ADR-212); an un-waived hit
blocks only when `hygiene.gate: blocking`. The marker set lives in a named constant in the
src module; the bin stays a shim. Word-boundary matching keeps a marker embedded in a
larger identifier from firing.
