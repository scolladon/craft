# 263 — Mutation coverage stays consumer-level, not per-adapter

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** none

## Context

**User-driven reframe.** The user challenged why a Stryker config exists at all, given craft is language-agnostic. Verified against the tree: `adapters/pi/stryker.conf.json` exists but is wired into **nothing** — no npm script references it, and `.claude/workflow.md`'s mutation probe is `test -f engine/stryker.conf.json` exclusively, which mutates `engine/src/**/*.js` only. Every adapter source in the repo therefore ships with **zero executed** mutation coverage today, pi included — pi is not a working precedent, it is an unexecuted config file.

## Options considered

1. **Ship one for `adapters/codex/src/**`, matching pi** — cons: reproduces pi's own problem, a file that looks like coverage and runs never.
2. **Defer, matching copilot and opencode** — the design's own split recommendation for this change ("defer here; land option 3 as its own scoped change") — superseded by the reframe below.
3. **Extend `engine/stryker.conf.json` to cover all adapter sources and wire it into the validation probe, retiring pi's orphan file** *(chosen)* — pros: fixes the real gap without inventing a per-adapter pattern. Cons: touches the shared harness config rather than only the new binding.

## Decision

The user's challenge reframed the premise beyond the design's split recommendation: **`engine/stryker.conf.json` is craft-the-consumer declaring its own validation technique in `.claude/workflow.md` — it is NOT part of the engine contract**, which is toolchain-neutral and probes whatever mutation technique the consuming repo declares (a Python consumer would declare `mutmut`, a Rust one `cargo-mutants`). Given that framing, option 3 is not a scope-expanding "harness change" to defer — it is this change correctly declaring its own JavaScript-specific validation technique for JavaScript sources that happen to live in this repo. **Chosen: ship NO `adapters/codex/stryker.conf.json`**; instead extend the existing consumer-level `engine/stryker.conf.json` mutate scope to cover the adapter guard sources, now, as part of this change.

## Consequences

- No per-adapter mutation-config pattern is invented; a future non-JS adapter inherits nothing nonsensical from this decision.
- `adapters/pi/stryker.conf.json` is recorded as an orphan file — wired into nothing — and its cleanup is tracked separately, not folded into this change.
- The adapter guard sources — the security-critical predicate surfaces — gain executed mutation coverage for the first time across any binding.
