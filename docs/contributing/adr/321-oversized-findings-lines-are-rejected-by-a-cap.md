# 321 — Oversized findings lines are rejected by a cap, and the pipe split is linear

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/scheduled-backlog-sweep.md · **Supersedes/Refines:** none

## Context

`parseLine` splits a per-line finding record on `/\s+\|\s+/u`. The engine retries `\s+` from
every position in a whitespace run and backtracks across it, so a single line costs O(n²):
measured 38,959 ms at 200,000 characters and 2.5 s at 40,000. The recorded trigger — "a
whitespace run before a trailing `|`" — turned out to be narrower than reality. Any interior
whitespace run *not* followed by `|`-plus-whitespace is quadratic; a run that does complete a
successful split is fast. That widens the reachable input class considerably.

The trigger is no longer hypothetical. The validation digest pipes a third-party technique's own
stdout through `normalizeFindings`, and progress bars and column-padded reporters routinely emit
long contiguous whitespace on one line.

Capping at the pipe was rejected before and stays rejected: canonical findings payloads are JSON
and commonly arrive as one long line, so truncating there corrupts valid input. Whatever bound
exists has to live inside the per-line path, which is the only place that knows it is looking at
a per-line record rather than a JSON document.

## Options considered

1. **Linear lookaround delimiter `/(?<=\s)\|(?=\s)/u` *and* a 16,384-character per-line cap raised in `parseLineShape` with a dedicated cap-named error** *(recommended)* — pros: removes the pathology at the root (38,959 ms → 0.62 ms at 200,000 characters), bounds what a broken technique can push through a boundary that exists to bound things, and reports an oversized line as oversized / cons: rejects input that is accepted today, so it is a behaviour change.
2. **Linear delimiter only — no cap, no behaviour change** — pros: honest, cheap, needs no ADR / cons: forgoes the input bound and the accurate diagnostic; a technique emitting megabytes on one line still gets to.
3. **Cap only, keeping the backtracking delimiter, oversized line returning `null`** — pros: smallest diff / cons: leaves the quadratic in place, and reports a well-formed 200,000-character line as a *format* error, sending the operator to hunt a syntax bug that is not there.

## Decision

**Ratified by the user.** Both halves land. The pipe delimiter becomes the lookaround form
`/(?<=\s)\|(?=\s)/u`, which is behaviour-identical — pinned by a 2,000,000-case differential at
the `parseLine` outcome level with zero mismatches, not asserted. Independently, a per-line cap
of 16,384 characters is raised in `parseLineShape`, and a line exceeding it produces an error
naming the cap and the measured length, distinct from the format error.

The rule for future work: a per-line findings record longer than 16,384 characters is rejected as
oversized, never as malformed. The two failure modes stay separately diagnosable.

## Consequences

The cap is the load-bearing behaviour change: input accepted today is rejected tomorrow. 16,384 is
over 200× the longest per-line record in the committed corpus (78 characters) and sits *above* the
quadratic's knee, so the ReDoS guards can be raised past 10,000 characters and still exercise the
split path rather than terminating early at the cap — the guards keep testing what they were
written to test.

The cap also bounds what a regressed delimiter could cost, and that bound is **per line**, not per
input: roughly 240 ms for one at-cap line, multiplied by the line count, since nothing bounds how
many lines arrive. An earlier statement of this consequence read as though the cap bounded the whole
input at 243.6 ms; measured against a deliberately regressed copy, fifty well-formed at-cap lines
cost 12.2 s. The per-line bound is still worth having — it is why the cap earns its place alongside
the delimiter rewrite rather than being made redundant by it — but it is a bound on the blast radius
of a regression, not a guarantee about total work.

The error message keeps the existing `Cannot parse findings: ` prefix and the existing
120-character echo truncation, so operator-facing output stays one family. JSON payloads are
unaffected: the cap lives in `parseLineShape`, which the JSON branch never enters.
