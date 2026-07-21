# 258 — Codex telemetry token arithmetic

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Refines ADR-257 (`collect` implementation)

## Context

Codex supplies `{input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens}`; `UsageEvent` needs `{input, cacheRead, cacheCreation, output}`. Whether `cached_input_tokens ⊂ input_tokens` is **not pinned**, and the two vendor conventions disagree: OpenAI's Responses API (which Codex speaks, row 18) reports cached as a breakdown *of* input; Anthropic's reports cache-read as *disjoint from* input.

## Options considered

1. **`input = max(0, input_tokens − cached_input_tokens)`, `cacheRead = cached_input_tokens`, `output = output_tokens`** *(chosen)* — pros: the only mapping whose total is exactly `input_tokens` under either convention. Cons: none material.
2. **`input = input_tokens`, `cacheRead = cached_input_tokens`** (treat as disjoint) — cons: **inflates every reported cost figure** if cached is actually a subset of input, the convention Codex speaks.
3. **`input = input_tokens`, `cacheRead = 0`** — drop the breakdown — cons: never over-reports, but discards cache-hit visibility for no gain over option 1.

## Decision

*Adopted as recommended (no user judgment).* Option 1. This is the only mapping whose total is exactly `input_tokens` under either convention: if the subset assumption is wrong, only the input/cache-read *attribution* shifts — the sum never moves. `reasoning_output_tokens` gets the mirror treatment: `output = output_tokens` alone is exact if reasoning is a subset of output, and under-reports (the safe direction) if disjoint; adding the two is the only variant that can over-report, so it is rejected by the same logic.

## Consequences

- Getting this backwards (option 2) would inflate every reported cost figure across the whole telemetry surface.
- Both rows stay recorded as closable by summing one real turn once the subset-vs-disjoint question is later pinned; option 1 is the safe default until then.
- A property test asserts `sum(input + cacheRead) === sum(input_tokens)` exactly, over generated well-formed turns — making the sum-safety a mechanical guarantee rather than a comment.

## Amendment (implementation refinement)

The shipped mapping in `engine/src/observability/adapters/codex/telemetry.js` refines option 1:
`cacheRead = min(cached_input_tokens, input_tokens)`, `input = input_tokens - cacheRead`, rather
than passing `cached_input_tokens` through raw as `cacheRead`. This is a strictly better
realization of this ADR's own stated justification, not a reversal of the decision.

Passing `cached_input_tokens` through unclamped keeps `input + cacheRead === input_tokens` exact
only in the common case — it breaks the moment `cached_input_tokens` exceeds `input_tokens`
(disjoint accounting, or malformed/inconsistent data), the exact failure mode this ADR exists to
close. The `min(...)` cap makes the identity **unconditional**: `input + cacheRead === input_tokens`
holds on every turn, not merely the well-behaved ones, and the mapping never invents tokens beyond
what Codex reported — only the input/cache-read *attribution* can shift under the disjoint
convention, never the sum. The property test cited above covers this unconditional form.
