# 019 — `findings-normalize` wiring scope at P5: review now, harnesses at P8

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-customizable-engine.md · docs/DESIGN-P5-contract-injection.md · **Supersedes/Refines:** none

## Context

`normalizeFindings` (the R10 seam, already a frozen export) tolerates a JSON array and a per-line
finding list interchangeably so consumers key on **fields** (`severity`, `file:line`, `reason`),
never on layout (SP5: output shape varies by model). P5 must wire it into a real consumer; which?

## Options considered

1. **Wire the `review` (harness-read) consumption now**; defer per-harness-exec survivor/violation
   formats to P8 with their ports. *(chosen)*
2. **Wire all harness consumers now** — premature: validation/architecture survivor formats aren't
   pinned until their ports land (P8); would invent shape contracts ahead of need.
3. **Defer all wiring** — leaves R10 unproven against any live consumer.

## Decision

P5 wires `normalizeFindings` into the **review output** path: the session normalizes the reviewer's
findings (via `engine/bin/normalize-findings.js`, the markdown session's CLI access to the pure
function) before applying them, keying on the canonical field set. Per-harness-exec specifics defer
to P8 alongside the harness ports.

## Consequences

R10 is proven against its first real consumer (review) at P5; the harness-exec wiring lands later
with no seam change (`normalizeFindings` is already frozen — P8 only adds callers).
