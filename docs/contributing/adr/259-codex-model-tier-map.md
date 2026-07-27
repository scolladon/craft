# 259 — Codex model tier map

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** none

## Context

Unlike Copilot — whose real model ids were DEFERRED behind an authenticated seat, forcing an `auto` placeholder for every tier — Codex's catalog is **CONFIRMED with no auth** (`codex debug models`, row 16): `gpt-5.6-sol` (frontier, priority 1), `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.2`, with reasoning levels `low`/`medium`/`high`/`xhigh`/`max` (+`ultra` on sol/terra only). Row 16a: an unknown model id does **not** error — it falls back to default metadata with a warning **and changes which tools are registered**, potentially removing `multi_agent_v1` and silently collapsing fan-out to sequential.

## Options considered

1. **`opus → gpt-5.6-sol`, `sonnet → gpt-5.6-terra`, `haiku → gpt-5.4-mini`**, with efforts `high`/`medium`/`low` *(chosen)* — pros: the auth-free catalog makes real ids possible on day one; `gpt-5.6-sol` matches the opus tier's role at priority 1. Cons: none material.
2. **All three tiers → a single mid id** (e.g. `gpt-5.5`), differentiated only by `model_reasoning_effort` — cons: under-serves the opus tier on the phases where craft deliberately spends more.
3. **Ship `auto`-equivalent placeholders and pin after a live smoke**, as copilot did — cons: an unnecessary placeholder here, since the catalog is auth-free and cheap to check today.

## Decision

*Adopted as recommended (no user judgment).* Option 1. `src/model-tier-map.js` mirrors `resolveCopilotModel`/`resolvePiModel`: own-property lookup (`Object.hasOwn`, so `__proto__`/`constructor` throw rather than resolve), explicit overrides beating committed defaults, and an **unknown tier throws** (fail-loud) given row 16a's stakes. A companion `resolveCodexEffort` maps tier → `model_reasoning_effort`. `ultra` exists only on `sol`/`terra` and must never be mapped to a tier that can resolve to another model.

## Consequences

- Real model ids ship on day one rather than a placeholder, unlike the copilot binding.
- The map must be cross-checked against `codex debug models` (auth-free, cheap, repeatable) whenever the catalog changes.
- A typo in the tier map is a topology bug (silent fan-out collapse), not a cosmetic error — test coverage asserts fail-loud behaviour on an unknown tier.
