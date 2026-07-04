# 211 — Prose anti-slop lint over touched docs and PR body

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/harness-hygiene-prune-gates.md
- **Scope:** workstream C2

## Context

LLM-authored docs and PR prose drift toward filler ("delve", "seamless", "it's important
to note"). No lint flags it. Same `intention-lint` template as the stub gate.

## Options considered

1. **`engine/bin/prose-lint.js` shim + `engine/src/prose-lint-main.js`, over touched docs +
   the PR body** (recommended) — pros: mirrors the stub gate; the ban-list is a curatable
   named constant / cons: prose bans risk false positives.
2. **Fold into the stub gate** — pros: one gate / cons: conflates code markers with prose
   style; different scopes.

## Decision

A prose gate greps touched documentation (and the PR body at propose) against a ban-list
seeded with `delve, leverage, seamless, robust, "it's important to note", "in conclusion"`
(C4). It lives as `engine/bin/prose-lint.js` + `engine/src/prose-lint-main.js` (C5-home).
**Ratified: the seed ban-list (small precise seed, C4) — the user curates it over time.
Adopted as recommended: home and scope.** A `SLOP-WAIVE(<phrase>)` prose token waives a
specific finding.

## Consequences

Slop surfaces advisorily (ADR-212). The seed is deliberately small and high-precision to
avoid crying wolf; growth is a one-line constant edit. Case-insensitive, word-boundary
matching keeps "robust" from firing inside longer tokens per the design's match rule.
