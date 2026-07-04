# 207 — Intention port self-governs via `subjects:` on its own port page

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/harness-hygiene-prune-gates.md · **Refines:** ADR-201
- **Scope:** default `file` adapter; workstream A1

## Context

The intention port guards other living pages but ships governing none of its own
sources. A change to `engine/src/intention.js` or its siblings raises no INTENTION-DRIFT,
so the guard does not dogfood itself.

## Options considered

1. **`subjects:` frontmatter on `docs/adapters/intention.md`** (recommended) — pros: the
   page is already in the zero-config corpus (`docs/adapters/*.md`), so no new wiring; the
   port guards itself with one frontmatter block / cons: none material.
2. **A dedicated new living page** — pros: leaves the port doc untouched / cons: a second
   page to maintain, needs corpus wiring, more drag.

## Decision

`docs/adapters/intention.md` carries `subjects: ["engine/src/intention*.js",
"engine/src/glob.js"]` line-1 frontmatter. Future edits to the port's own sources that
leave the page untouched (and unwaived) raise INTENTION-DRIFT. The `intention*.js` glob
covers `intention.js`, `intention-subjects.js`, `intention-lint-main.js`; `glob.js` is
included because it is a load-bearing port primitive (`matchGlob`/`globsOverlap`) even
though shared. **Adopted as recommended (no user judgment): the "reuse the existing corpus
page, one primitive, no new SoT" principle, uncontested.**

## Consequences

The port dogfoods its own guard. Because this change edits those sources, `intention.md`
is itself touched here, so the drift is self-satisfied for this run. Including `glob.js`
trades a slightly wider net (a glob.js-only change now expects an `intention.md` touch or
a waiver) for complete self-governance; the advisory-first posture keeps this a signal,
never a hard block.
