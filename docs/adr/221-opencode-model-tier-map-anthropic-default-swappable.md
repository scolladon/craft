# 221 — opencode model tier map: Anthropic default, swappable, provider-neutral manifest

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** none

## Context

Craft tiers (`opus|sonnet|haiku`) bind to Claude SKUs via agent frontmatter under the Claude binding; opencode binds a `provider/model` string. Provider-agnosticism is a kickoff constraint (PRD §7); the resolution ORDER stays core policy (Model port).

## Options considered

1. **Committed default `opus|sonnet|haiku → anthropic/<sku>` map (pure seam + per-agent frontmatter), overridable via `opencode.json`/manifest, proven on a non-Anthropic provider** *(designer recommendation)* — pros: provider-agnostic, zero-config, pi-Gemini precedent; keeps the manifest portable. Cons: none material.
2. **Require the user to set every agent's model** — cons: not zero-config.
3. **Anthropic-only** — cons: forfeits the provider-agnostic proof.

## Decision

*Adopted-as-recommended (no user judgment).* A committed default tier→`provider/model` map, expressed as (a) per-agent `model: anthropic/<sku>` frontmatter pins and (b) a pure `adapters/opencode/src/model-tier-map.js` seam (`resolveOpencodeModel(tier, overrides)`). Overrides: `opencode.json` `agent.<role>.model` and manifest `models.<role>` (tier strings only). `.claude/workflow.md` stays provider-neutral (tier strings, never `provider/model`).

## Consequences

- Zero-config default; the manifest stays portable across bindings.
- Provider-agnosticism (R-G5) is proven by mapping a tier to a non-Anthropic `provider/model` in the live smoke.
- The tier→SKU table has a single home (`model-tier-map.js`), unit-tested.
