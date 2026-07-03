# 206 — Subjects-∩-diff matching uses `node:path` `matchesGlob`

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/intention-port.md · **Refines:** ADR-201

## Context

Freshness matching intersects each changed path against a page's `subjects:` globs, per
changed file per page (a hot path). The "no new runtime dependency for the default
adapter" constraint rules out an npm glob library. Two zero-dependency options remain;
both were verified working on node 22.22.3 this run (`*` matches within a path segment,
`**` across segments).

## Options considered

1. **`node:path` `matchesGlob`** (recommended) — pros: built-in, zero code to own,
   predictable segment/recursive semantics confirmed this run / cons: stability-1
   (experimental) — semantics could churn across Node versions, and craft aims to be
   portable and long-lived.
2. **Hand-rolled glob→RegExp (~20 lines in `engine/src`)** — pros: node-version
   independent, fully mutation-testable, no experimental-API exposure / cons: a small
   amount of glob logic craft owns and must keep correct.
3. **Shell out to git pathspec** — pros: reuse git's matcher / cons: reintroduces a
   shell/process dependency in a hot path, against the zero-dependency spirit.

## Decision

The `file` adapter matches globs with `node:path` `matchesGlob`. **Ratified by the user
(this run): the experimental-stability trade-off against the hand-rolled fallback was
surfaced as a genuine fork; the user accepted the built-in.** The glob-matching call is
isolated behind one internal helper so a later swap to the hand-rolled fallback (option 2)
is a single-site change should the experimental API churn.

## Consequences

Craft's default adapter depends on a stability-1 Node API. The isolating helper and its
tests pin the expected semantics, so an upstream behavior change surfaces as a red test,
not a silent freshness miss.
