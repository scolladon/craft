# 328 — Sub-agent labels come from the meta sidecar, not spawn rollups

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** none

## Context

Once per-sub-agent transcripts supply the token truth, the spawn rollup loses its only
remaining job — carrying `phase`/`role`. The question is whether it keeps that job.
Measurement decides it: `agent-<id>.meta.json` carries `agentType` on 243/243 sub-agent
transcripts corpus-wide, while rollup `agentType` is present on only 188/237. In the
reference session the 7 rollups missing `agentType` are the *same lines* that carry no
`usage` and no `totalTokens` — so keeping rollups as the label source leaves exactly the
reviewer work both unlabelled and uncosted.

## Options considered

1. **Sidecar only, rollups go entirely** (designer's recommendation) — pros: full label
   coverage; makes no-double-count structural rather than filtered; removes the depth-2
   nested-rollup vector without a special case / cons: depends on an undocumented upstream file.
2. **Sidecar primary, rollup fallback** — pros: survives a sidecar rename / cons: buys back
   rollup parsing plus a precedence rule for a set the sidecar already fully covers.
3. **Rollups label, transcripts supply tokens** — pros: matches the brief's original framing /
   cons: 49 sub-agents corpus-wide stay unlabelled; reopens double-count and depth-2.

## Decision

Ratified by the user: **option 1**. The claude telemetry binding reads `agentType` from
`agent-<id>.meta.json` and never parses spawn rollups. Rollup lines are not a token source
and not a label source.

Because rollups are never read, "do not double-count" stops being a rule anyone can violate:
rollup lines are `type: 'user'` and usage-bearing lines are `type: 'assistant'`, with a
measured intersection of exactly zero across all 273 files. A single emission rule — emit one
event per line carrying `message.usage` — is simultaneously the main-loop rule and the
sub-agent rule, and cannot express a rollup.

## Consequences

- An upstream rename of the sidecar silently unlabels every sub-agent. Mitigated by a
  **counted** fallback that surfaces the miss rather than emitting a silent `null`.
- The depth-2 sub-agent vector closes for free: nested rollups live *inside* sibling depth-1
  transcripts, so any rollup+transcript hybrid would double-count depth-2 work while looking
  correct at depth 1.
- `meta.model` is NOT used — it is present on only 64/243 sidecars and is a short alias
  (`sonnet`), not a priceable id. Model comes from `message.model` per turn.
