# 278 — Status vocabulary disambiguates per-line parsing; JSON value passes through

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-07-25
- **Design:** docs/design/sp9-findings-adoption.md · **Supersedes/Refines:** none

## Context

The normalizer must decide how strictly to treat the new `status` value: reject unknown
values, or stay a dumb deterministic seam. The existing precedent is `severity`, which is
stored as `String(severity)` and never validated.

## Options considered

1. **Closed-set validated — unknown status throws** — pros: catches typos at the seam /
   cons: rejects legitimate reviewer output on a typo; diverges from severity handling.
2. **Pass-through `String(status)`, unvalidated everywhere** — pros: simplest / cons: the
   per-line parser still needs the closed set to disambiguate a status prefix from a
   severity token, so "unvalidated everywhere" is not actually attainable per-line.
3. **Closed vocab used only for per-line status-vs-severity disambiguation; JSON `status`
   passed through** *(recommended)* — pros: matches the severity precedent, keeps the seam
   dumb, consumer owns semantics / cons: an unknown JSON status flows downstream.

## Decision

Option 3. The four-token set exists in the parser solely to recognize a per-line status
prefix; a JSON `status` value is passed through unvalidated. The review skill (consumer)
owns semantics and treats only `RULED-OUT` specially.

## Consequences

The seam stays deterministic and dumb, mirroring severity. Consumers must tolerate
non-canonical status strings arriving via JSON (treated as actionable by default).
