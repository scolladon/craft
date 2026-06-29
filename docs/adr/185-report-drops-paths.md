# 185 — Report output drops paths entirely

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/usage-telemetry-miner.md

## Context

The miner's `report.{json,md}` are written inside the repo and may be committed. Per the
no-leak constraint (memory content-whitelist parity), output must carry no absolute
paths, `$HOME`, usernames, PII, or prompt/response text. The choice is how strongly to
redact path-shaped data: drop, hash, or relativize.

## Options considered

1. **Drop paths entirely** — output carries only mechanically-derived numbers and
   phase/model labels; runs correlate via the opaque `sessionId` already present.
   Simplest provable no-leak. **(recommended)**
2. **Hash with a salt** — preserves cross-report path correlation without exposing the
   path. Cons: salt management for a correlation `sessionId` already provides.
3. **Relativize** — strip `$HOME`/repo-root, keep relative structure. Cons: leaks
   repo-internal structure; weaker guarantee.

## Decision

The report **drops paths entirely**. Only numbers and phase/model/`sessionId` labels
reach the output. The redaction is a positive whitelist (emit only known-safe fields),
not a blacklist (strip known-bad ones), so a new field defaults to excluded.

## Consequences

The report is trivially safe to commit and share. Cross-report correlation rides on the
opaque `sessionId`, so no path-derived join is needed. A future need to correlate by path
would require revisiting this ADR, not loosening a filter.
