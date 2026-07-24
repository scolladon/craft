# 268 — GUIDE-concepts joins the living corpus by explicit filename, not a glob

- **Status:** accepted
- **Date:** 2026-07-24
- **Design:** docs/design/communication-revamp-four-frames.md · **Supersedes/Refines:** none

## Context

`docs/GUIDE-concepts.md` (the four-frames orientation guide) must join the living corpus
enumerated by `scripts/living-corpus.sh` (ratified). The enumerator's second `find` clause
is a deliberate whitelist: it globs `DESIGN-*.md` but names `DOD.md` and
`GUIDE-customizing.md` explicitly. How the new page enrolls decides whether future
`GUIDE-*.md` files auto-enter the intention corpus.

## Options considered

1. **Explicit filename** — add `-o -name 'GUIDE-concepts.md'` to the whitelist clause
   (designer's recommendation) — pros: matches the house pattern; membership stays a
   deliberate, greppable, fail-loud decision / cons: one more literal to maintain.
2. **Widen the glob** — `GUIDE-customizing.md` → `GUIDE-*.md` — pros: no future edit for
   new guides / cons: silently auto-enrolls any future `GUIDE-*.md` into the corpus.
3. **Glob in the enumerator, explicit test pin** — cons: enumerator and pin follow two
   different philosophies; drift surfaces only in the pin.

## Decision

**Adopted-as-recommended (no user judgment).** Option 1: the enumerator whitelists
`GUIDE-concepts.md` by name. Corpus membership remains an explicit, per-file decision.

## Consequences

Every future guide must be enrolled deliberately (one enumerator line + one pinned test
entry) — the pair moving together is exactly what `test/living-corpus.test.js` enforces.
No accidental corpus growth; the intention corpus stays curated.
