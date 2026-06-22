# 128 — An `always` verdict supersedes the hardcoded merge/propose confirmations

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P23-configurable-policy-hooks.md · **Supersedes/Refines:** none

## Context

Today the merge confirmation (`integrate/SKILL.md:17`) and the `pr.creator: user` stop are hardcoded
human gates. The load-bearing fork of P23: may an `always` verdict **lift** these gates (enabling
config-driven auto-merge/auto-PR), or only **layer** additional friction beneath them? This is the
highest-blast-radius choice in the feature — it governs whether a config file can remove the last
human gate on an irreversible remote action.

## Options considered

1. **Floor-only** *(designer recommendation)* — `always` skips craft's own extra ask, but the merge/PR confirmations survive as non-overridable floors. pros: safest; no config can auto-merge. Cons: headless end-to-end auto-merge impossible by construction.
2. **Supersede** *(chosen — user judgment)* — `always: [integrate]` fully replaces the hardcoded confirmation → genuine config-driven auto-merge. pros: enables true headless harness-as-a-service autonomy. Cons: a config file can remove the last human gate on an irreversible remote action.
3. **Split** — supersede `push`/`propose` but floor-only `integrate` — pros: auto-push/PR with a human merge gate. Cons: asymmetric; still blocks the headless merge use case.

## Decision

An `always` verdict **supersedes** craft's hardcoded merge-confirmation and `pr.creator: user` stops.
With `always: [integrate]` set, craft auto-merges once its propose gate is green; with
`always: [propose]`, it auto-creates the PR. The merge confirmation is therefore a **policy-governed
default (`ask` per ADR-127), not a non-overridable floor**. The three engine floors —
never-commit-on-red, validation-triage-gates-propose, artifact-handoff — remain non-overridable and
are **not** policy-nameable actions.

## Consequences

- Enables headless end-to-end auto-merge via `always: [integrate]` + headless pre-approval (ADR-130) — the harness-as-a-service use case.
- The human merge gate becomes **opt-out via config** rather than absolute; safe-by-default is preserved by ADR-127 (unconfigured → `integrate` defaults to `ask`).
- Deviates from the design recommendation (Floor-only) → triggers a design revision (scope-fold) before planning.
