# 323 — Scope specs are newline-delimited

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/scheduled-backlog-sweep.md · **Supersedes/Refines:** refines ADR-305

## Context

`parseScopeSpec` splits on `,`, so a legal path containing a comma (`a,b.js:1-9`) breaks into
fragments. The failure is loud, not silent: the fragment `a` carries no range and `parseScopeEntry`
throws `malformed scope entry`. Nothing is ever mis-scoped. So this is a question about which forms
are *supported*, not a bug report.

ADR-305 ratified the comma-joined form. Its substantive ground was that the spec must be **one
argument**, so the repeated-flag hazard — where two `--mutate` flags silently drop all but the last
and fake a clean score — cannot recur. That ground is about argument count, not about which
character separates entries.

The call site has since changed in a way that makes the delimiter free to choose: the spec is
written to a `mktemp` file and read into a variable before being passed. A newline delimiter now
costs nothing there, and it removes the ambiguity at the root, because a path cannot contain a
newline.

## Options considered

1. **Newline-only — `parseScopeSpec` splits on `\n`; comma stops being a delimiter** *(recommended)* — pros: removes the ambiguity at the root rather than working around it; keeps ADR-305's one-argument ground fully intact / cons: the hand-authored form `"a.js:1-9, b.js:1-9"` becomes one malformed entry, and the code comment protecting that form goes away.
2. **Newline or comma — split on `/[\n,]/`** — pros: nothing that parses today stops parsing / cons: it looks like the compromise and is not, because keeping comma as a delimiter keeps the comma hazard for every spec; it buys an option without fixing anything.
3. **Status quo, with the comma-bearing-path limitation documented in the ADR trail** — pros: genuinely defensible YAGNI — no tracked path in this repo contains a comma, and today's failure is loud / cons: leaves an unsupported path form that will surprise whoever first hits it.

## Decision

**Ratified by the user.** `parseScopeSpec` splits on the newline. Comma is no longer a delimiter.

The rule for future work: a scope spec is one argument carrying newline-separated
`<file>:<start>-<end>` or `<file>:*` entries. ADR-305's one-argument requirement is unchanged and
still binding; only the separator within that single argument is refined here.

## Consequences

The hand-authored comma-joined form stops parsing. **A claim made here when this decision was
ratified turned out to be false, and is corrected in place rather than left standing:** it stated
that `"a.js:1-9, b.js:1-9"` would become a single malformed entry and throw, so no new class of
silent drop was introduced. Measured against the landed code, it does not throw —
`parseScopeSpec('a.js:1-9, b.js:1-9')` yields `[{ file: 'a.js:1-9, b.js', start: 1, end: 9 }]`,
because the deliberately greedy head backtracks to the *last* colon and absorbs the rest of the
spec into the file name. The `:*` form collapses the same way. That is a silent mis-scope: the
resulting file name matches nothing, so every finding for both files drops without a word.

The delimiter ruling stands; the omission was a guard, not the delimiter. ADR-327 adds it, and the
"never a silent drop, never a silent widen" invariant this module states in its own comments is
restored there. The trimming that the retired comment protected is still worth keeping per entry,
since a newline-joined spec can carry trailing spaces just as easily.

Every generated call site already writes the spec to a file, so the delimiter change is invisible
there. What must be checked when this lands is documentation and any example spec in prose: an
ADR-305-era comma example left standing would now be wrong rather than merely dated.
