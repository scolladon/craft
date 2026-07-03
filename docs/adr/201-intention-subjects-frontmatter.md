# 201 — File adapter: living pages declare `subjects:` frontmatter

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/intention-port.md · **Refines:** ADR-199, ADR-200
- **Scope:** default `file` adapter only (a custom adapter maps change-scope → intention
  units however it chooses)

## Context

The `file` adapter needs one mechanical primitive from which consult-filtering,
freshness, and coverage all derive. The provenance rule keeps traceability one-way
(docs point at code, never the reverse), so the mapping from a changed code path to the
intention entry that governs it must be declared on the doc side.

## Options considered

1. **`subjects:` path-glob frontmatter on each living page** (recommended) — pros: one
   primitive, no second source of truth, the mapping diffs with the page it governs /
   cons: every adopting page carries frontmatter.
2. **Central CODEOWNERS-style map file** — pros: all mappings greppable in one place /
   cons: a new standalone staleness liability — the map rots independently of the pages.
3. **None — keep the LLM-judgment affected-page probe** — pros: zero mechanism / cons:
   nothing mechanical to guard; the status quo gap remains.

## Decision

Living pages in the `file` adapter carry `subjects: [<globs>]` frontmatter (Line-1
frontmatter, reusing the DOD parser's fail-loud-on-malformed / null-on-absent
semantics). A page without it is noted advisorily and skipped — adoption is incremental,
absence is never an error. **Adopted as recommended (no user judgment): the
"one primitive, no second SoT" principle stated in the design and uncontested.**

## Consequences

Freshness = (changed path ∩ a page's subjects) ∧ page untouched in the branch ∧ no
waiver. Coverage reads an optional `intention.covers:` manifest list. Custom adapters
are unaffected — they own their own scope→unit mapping.
