# 122 — The learnings store is bounded by an entry-count and byte cap, with merge-before-insert and newest-window eviction

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P22-repo-local-craft-memory.md · **Supersedes/Refines:** none

## Context

An uncapped store grows monotonically, turning the diffable artifact (Req 7) into review-hostile noise
and enlarging the poisoning surface; the size cap is itself an anti-staleness guard. The design
recommended a single global entry-count cap with global lowest-confidence-first eviction. The user
specified a more nuanced policy that composes the size mechanisms and refines the write/eviction rules.

## Options considered

1. **Single global entry-count cap, global lowest-confidence-first eviction** *(designer
   recommendation)* — pros: simplest to reason about and lint. Cons: evicts proven old entries on the
   same footing as recent churn.
2. **Per-concern caps** — pros: one noisy concern can't starve others. Cons: more config surface
   before there's evidence one concern dominates.
3. **Max-byte guard** — pros: bounds the serialized size directly. Cons: opaque to a reviewer reading
   a diff.

The user's decision composes (1)+(3) and refines the write/eviction rules — below.

## Decision

*User decision (escalated; deviates from recommendation).* The learnings store is bounded by **both** a
global **entry-count cap and a max-byte guard**. Write and eviction obey:

- **Ordering:** entries are ordered oldest→newest (new entries are appended last).
- **Merge-before-insert:** before inserting an observation, attempt to merge it into an existing
  matching entry (same concern + key). If a match exists, update it **only when the new observation
  improves the entry's meaning** (it is interesting / better); otherwise leave the existing entry
  untouched — no churn, no duplicate.
- **Eviction-on-cap:** when a `save` would exceed either cap, removal is restricted to the **50 newest
  entries**; within that window the **least-relevant** entry (lowest confidence/decay score; ties →
  oldest provenance) is dropped, repeating until the store fits both caps. Entries older than the
  newest-50 window are never evicted by the cap — they are pruned only by decay+floor and
  validate-on-read.

The entry-count cap default and the byte-guard default are tunable config; "relevance" is the
confidence/decay score already maintained for the update semantics, so the cap adds no new scoring
machinery.

## Consequences

- Established (older) facts are protected from cap eviction; only the recent-churn window is culled by
  the cap, while old staleness is still handled by decay and validate-on-read.
- Merge-before-insert keeps the store lean and de-duplicated; "improve only if interesting" avoids
  rewriting stable entries on every recurrence.
- Adds a byte measurement over the single serialized file (ADR-117); reuses the existing decay score.
- The separate metrics artifact (ADR-119) is exempt from this cap (different lifecycle).
- Deviates from the design recommendation → triggers a design revision (scope-fold) before planning.
