---
subjects:
  - evals/implementer-runs-guards/**
---
# 416 — The implementer case shares its prompt across arms

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/implementer-guard-eval.md · **Supersedes/Refines:** none

## Context

The bare arm has no `craft:part-implementer` agent. Deciding which graders score both arms decides what Δ measures.

## Options considered

1. **Shared prompt; the seven outcome graders score both arms; `fired` and `contract-delivered` are with-only** *(recommended)* — pros: Δ isolates the agent body / cons: the bare arm also gets the contract, so Δ says nothing about the contract text itself
2. **Every outcome grader with-only** — pros: simple / cons: no Δ
3. **Deterministic graders both, `llm` graders with-only** — pros: cheaper judge / cons: hides whether a bare session reports a `GUARD` as well as the agent does

## Decision

Adopted-as-recommended (no user judgment): option 1. The with-craft score is the behavioural evidence for the contract rule.

## Consequences

- The bare arm runs at the session tier unless it spawns an agent, so its score compares with the agent column only at sonnet.
