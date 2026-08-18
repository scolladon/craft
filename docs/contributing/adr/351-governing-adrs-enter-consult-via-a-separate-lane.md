---
subjects:
  - engine/src/intention.js
  - scripts/governing-corpus.sh
---
# 351 — Governing ADRs enter `consult` via a separate enumeration lane

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-08-18
- **Design:** docs/contributing/design/decision-drift-propagation.md · **Supersedes/Refines:** none

## Context

`consult` and `assertFresh` share `readSubjectPages(deps)`, which reads one corpus
(`deps.listCorpus()`) under one key. Making ADRs consultable requires them in `consult`'s
input; keeping decision records frozen requires them out of `assertFresh`'s. The split has
to land somewhere.

## Options considered

1. **Separate enumeration lanes** — `consult` takes a second `deps.listGoverning`;
   `assertFresh` reads only `listCorpus` — pros: no ADR path is ever passed to the freshness
   walk / cons: one more injected dep. *(designer's recommendation)*
2. **One widened corpus, distinct `governs:` key** — pros: single enumerator / cons: walks all
   350 ADRs in every freshness report, emitting 350 `no-subjects` skip rows.
3. **One corpus plus a `frozen: true` flag** — pros: no new lane / cons: correctness depends on
   a per-file flag authored 350 times; one missed flag is a false drift on a frozen record.

## Decision

**adopted-as-recommended (no user judgment).** Option 1. The split lands at the enumeration
boundary, where the corpus is already single-sourced. `scripts/living-corpus.sh` keeps its
exact output; `scripts/governing-corpus.sh <adr-dir>` is its sibling.
`readSubjectPages(list, readPage)` is parameterised by the list it walks and nothing else.
The frontmatter key stays `subjects:` in both lanes — one convention, one parser.

## Consequences

No ADR can appear in `stale[]`, `uncovered[]` or `skipped[]` of a freshness report, because no
ADR path reaches `assertFresh` — the guarantee is structural, not a runtime filter a later
corpus edit can defeat. An absent `listGoverning` yields an empty governing lane, so a repo
with no ADR directory consults exactly as it does today. `parseSubjects` and `intention-lint`'s
form check are untouched.
