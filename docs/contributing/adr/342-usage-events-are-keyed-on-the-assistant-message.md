# 342 — Usage events are keyed on the assistant message, not the transcript line

- **Status:** accepted
- **Date:** 2026-08-07
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** refines ADR-328

## Context

ADR-328 replaced rollup-derived usage with the rule *one event per line carrying
`message.usage`*, and argued that rule made double-counting structurally impossible: rollup
lines are `type: 'user'`, usage-bearing lines are `type: 'assistant'`, and the measured
intersection is zero. That argument is sound — and insufficient.

Claude Code writes **one transcript line per content block** of a single assistant API
response (thinking, text, and each `tool_use`). Every such line repeats the *same*
`message.id` and the *same* request-level counts. Measured over craft's own corpus:

```
usage-bearing assistant lines : 24,909
distinct message ids          : 10,784
ids spanning >1 line          :  8,492
  identical input_tokens across an id's lines : 8,492 / 8,492
  identical cache_read across an id's lines   : 8,492 / 8,492
  output_tokens monotonically non-decreasing  : 8,492 / 8,492
```

`input_tokens` and `cache_read_input_tokens` are **per-request** quantities. Counting them
once per content block is not a convention choice; it is arithmetic that adds the same
request's input tokens two or three times. The rule therefore replaced a ~58–100x
under-count with a ~2x over-count.

Rollup-disjointness was real. Per-line uniqueness was assumed and never checked.

## Options considered

1. **Key emission on `message.id`, last line wins** — pros: request-level fields counted once;
   `output_tokens` is monotonic so the final line carries the complete turn / cons: requires a
   per-stream map and a second baseline regeneration.
2. **Keep per-line and document it as the convention** — cons: `input`/`cache_read` are
   per-request fields; no framing makes counting them per block correct, and craft would keep
   self-reporting roughly double.
3. **Sum only `output_tokens` per line and take input/cache from the first line** — cons: same
   result as (1) by a more fragile route, and it breaks if block ordering ever changes.

## Decision

Ratified by the user: **option 1**. Emission is keyed on the assistant `message.id`. The first
usage-bearing line for an id emits the event; a later line with the same id **replaces** that
event's `tokens`/`cacheCreationTtl` and does **not** increment `messages`. A line carrying no
`message.id` emits unconditionally, as today.

`messages` consequently counts **billed turns**, which is what it always claimed to mean.

ADR-328's structural no-double-count claim is narrowed rather than withdrawn: not reading
rollups still makes the rollup tier unreachable. Uniqueness *within* the assistant tier is
enforced by this keying, and the module header must say so rather than asserting that the
line rule alone is sufficient.

## Consequences

- **The published benchmark figures were collected per-line and are corrected by this
  decision.** Re-derived per-message: plain 61,338,210 tokens / $39.13 (published 88.6M /
  $62.72); staged 93,259,567 / $57.77 (published 154.3M / $103.95); craft 273,114,810 /
  $145.67 (published 544.3M / $297.55).
- The inflation differed per arm (1.45x / 1.65x / 1.99x), so the **comparative** claim moves
  too: craft cost roughly **3.7x** the plain run, not 4.7x. README and
  `docs/guides/comparison.md` are corrected in this change, with a note recording that the
  earlier figures over-counted request-level tokens.
- ADR-339's golden vector is re-pinned to the per-message figures; the earlier vector
  reconciled to the published per-line numbers and would otherwise lock in the defect.
- The drift baseline is regenerated a second time, after this fix.
- Verifying a fix against an oracle derived by the same method cannot detect a shared
  convention error. The per-line pin and the implementation agreed exactly and were both
  wrong; only an independent check of the transcript's own structure surfaced it.
