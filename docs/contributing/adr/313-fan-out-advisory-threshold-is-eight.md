# 313 — The fan-out advisory threshold is eight, anchored to double the default

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** refines 312

## Context

The advisory needs a number. The shipped default is four reviewers — four dimensions at one
pass each. This repo's own metrics put a reviewer spawn at a pooled median near 92,500 tokens,
so eight reviewers is roughly 740,000 tokens for a first round, and the phase lands past a
million once the default convergence cycles add their fix-delta rounds.

## Options considered

1. **Warn above eight — double the shipped default** *(recommended)* — pros: anchored to a shipped number rather than picked; leaves room for a legitimate fifth or sixth dimension / cons: a costly tune just under the line is silent.
2. **Warn above six** — pros: fires earlier / cons: no anchor — six is not a multiple of anything shipped.
3. **Warn above four** — pros: any tune above the default is visible / cons: fires on every legitimate small tune, training operators to ignore it.

## Decision

**Ratified by the user, as recommended.** The advisory fires when the resolved product of
dimensions and passes exceeds eight.

## Consequences

The default configuration never warns, and neither does a modest dimension addition. The
threshold is justified by measured token cost, not by any external guidance about how many
agents a wave should hold — craft's reviewers are read-only lenses whose independent
orientation is deliberate, which is a different case.
