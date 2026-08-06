# 340 — Main-loop events carry billed turns but no duration

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** extends ADR-337

## Context

ADR-337 settled `messages`/`durationMs` for sub-agent events only. ADR-329 introduces a
main-loop group, so the same question reopens for it — and this one reaches a published claim:
`recomputeClaims` sums `durationMs` across all groups and feeds the README FAQ through the
`readme-drift` guard. The FAQ prose scopes that number to *"role-agent activity"*, which a
main-loop group falsifies by construction.

## Options considered

1. **`messages` = billed turns, `durationMs` = 0** (designer's recommendation) — pros: the only
   option that leaves the README's *sentence* true rather than merely refreshing its numbers /
   cons: asymmetric with ADR-337.
2. **Derive both from the transcript, mirroring ADR-337** — pros: symmetric, arguably the more
   honest raw number / cons: silently changes what the published duration *means*; would require
   rewriting the FAQ prose in the same change.
3. **Zero both** — cons: discards a billed-turn count nothing else reconstructs.

## Decision

Ratified by the user: **option 1**. A main-loop event carries `messages` = billed turns and
`durationMs` = 0.

## Consequences

- The asymmetry with ADR-337 is deliberate and must be commented at the emission site, or a
  future maintainer will "fix" it and silently falsify the README sentence.
- `recomputeClaims`' duration sum continues to mean role-agent activity only, so the FAQ prose
  stays accurate without a rewrite.
- Main-loop wallclock is consequently not available from the report; anyone needing it must read
  transcripts directly.
