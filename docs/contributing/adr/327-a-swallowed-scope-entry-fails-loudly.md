# 327 — A swallowed scope entry fails loudly

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/scheduled-backlog-sweep.md · **Supersedes/Refines:** refines ADR-323

## Context

ADR-323 made scope specs newline-delimited and asserted that the retired comma-joined form would
therefore throw. It does not. Measured against the landed code:

```
parseScopeSpec('a.js:1-9, b.js:1-9') → [{ file: 'a.js:1-9, b.js', start: 1, end: 9 }]
parseScopeSpec('a.js:*, b.js:*')     → [{ file: 'a.js:*, b.js', start: 0, end: MAX }]
```

`SCOPE_ENTRY_PATTERN`'s head is greedy on purpose, so the *last* colon separates path from range —
the property that lets a colon-bearing path parse at all, and the same property ADR-325 recorded as
load-bearing. Applied to a whole comma-joined spec presented as one entry, it absorbs everything up
to the final entry's colon into the file name. The result is a file name nothing will ever match, so
every finding for every file in that spec is dropped in silence.

The module states its own invariant in its comments: never a silent drop, never a silent widen. This
is a silent drop, introduced by the delimiter change and missed because the ADR reasoned about the
pattern rather than running it.

## Options considered

1. **Reject swallowed-entry shapes in `parseScopeEntry`: throw when the matched file part contains a range-or-star immediately followed by a comma** *(recommended)* — pros: makes the retired form fail loudly exactly as ADR-323 assumed it already did; narrow enough to leave every form this run deliberately preserved intact / cons: one more shape-specific guard in a module that prefers general rules.
2. **Re-open the delimiter decision and accept comma as well as newline** — pros: nothing that parses today stops parsing, so the collapse cannot arise / cons: re-admits the comma hazard for every spec, which is the exact thing newline-only was chosen to remove.
3. **Accept the behaviour and correct ADR-323's consequence text only** — pros: cheapest; every generated call site already writes newline / cons: knowingly leaves a silent drop in the one module whose design principle forbids them.

## Decision

**Ratified by the user.** `parseScopeEntry` throws when the file part it matched contains a
range-or-star immediately followed by a comma — the signature `/:(?:\d+-\d+|\*)\s*,/`, which is
exactly what a swallowed entry leaves behind.

The rule for future work: a scope entry whose file name still carries another entry's range is a
malformed spec, not an exotic filename. It is rejected, never scoped.

## Consequences

The guard is deliberately narrow, and its narrowness is the point — it must not fire on the two
forms this run went out of its way to keep working. Verified against both: `C:\repo\a.js` carries a
colon but no range, and `notes:1-9.txt` carries a range but no trailing comma. Neither trips it.

This does not make every mis-typed spec loud, and it should not be read as doing so. It closes the
one shape the delimiter change created — a whole comma-joined spec arriving as a single entry —
which is the shape a human hand-authoring the retired form will actually produce.

**One residual hole is deliberate, because closing it would cost more than it buys.** When the
*first* entry of a retired comma-joined spec carries no range, nothing is left behind for the guard
to see, and the spec still collapses silently:

```
parseScopeSpec('a.js,b.js:1-9') → [{ file: 'a.js,b.js', start: 1, end: 9 }]
```

Widening the guard to catch it was proposed and rejected on measurement: every formulation that
rejects `a.js,b.js:1-9` also rejects `a,b.js:1-9` — a legitimate comma-bearing path, which is the
exact capability the newline delimiter was chosen to support. The two are shape-identical and
genuinely indistinguishable without knowing whether `a.js` is a file or a fragment. The guard stays
narrow, and this shape stays a known limitation rather than a bug to be fixed later.

A spec that is malformed in some other way still fails however it failed before.

The general lesson is recorded here rather than in the design: a decision about a regex's *inputs*
is not verified by reading the regex. ADR-323's false consequence survived ratification because it
was reasoned about rather than run.
