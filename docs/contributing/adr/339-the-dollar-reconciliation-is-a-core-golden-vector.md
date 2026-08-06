# 339 — The dollar reconciliation is a core golden vector

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** refines ADR-338

## Context

ADR-338 requires the test strategy to assert the dollar reconciliation. Revising the design
against that requirement surfaced a wrinkle: the benchmark craft-arm session was resumed the
next day, so mining its whole project directory yields 753,224,548 tokens / $425.62. The miner
has `--since` but no upper bound, so the published $297.55 cannot be reproduced through the
CLI as it stands — only by a test that applies its own cutoff.

## Options considered

1. **Golden vector in the pure core** (designer's recommendation) — a fixed token/model vector
   asserted against the real `DEFAULT_PRICES` — pros: meets ADR-338 with no new user-facing
   surface / cons: the published figure stays non-reproducible through the front door.
2. **Golden vector plus an `--until` flag** — pros: makes the headline claim independently
   checkable by running the miner / cons: adds a user-facing flag.
3. **Live reconciliation script only** — foreclosed by ADR-338.

## Decision

Ratified by the user: **option 1**. The reconciliation is pinned as a golden vector in
`engine/src/observability/usage-aggregate.js`'s test surface, against the real `DEFAULT_PRICES`.
No `--until` flag is added.

The arithmetic was verified independently before ratification, on all three benchmark arms,
against the transcripts still on disk: plain 88,634,469 tokens / $62.722473 (published $62.72);
staged 154,307,277 / $103.950712 ($103.95); craft 544,271,827 / $297.550926 ($297.55). The
reconciliation also pins `claude-opus-5 = priceEntry(5, 25)`, `claude-sonnet-5 = priceEntry(3, 15)`,
and all three cache multipliers to the cent.

## Consequences

- **Accepted limitation:** a user cannot reproduce the published dollar figure by running
  `usage-mine`; reproducing it requires the cutoff the golden vector encodes. This is a known
  gap, recorded here rather than discovered later, and is follow-up material.
- The README and `docs/guides/comparison.md` figures are confirmed correct and need no numeric
  change — they are craft-reproducible in principle once ADR-338 lands.
- A future `--until` flag remains open and is not foreclosed by this decision.
