# 139 — `craft:init`'s interview is interactive-only (orchestrator `AskUserQuestion`)

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P25-interactive-manifest-generator.md · **Supersedes/Refines:** none

## Context

The interview gathers customization answers. `AskUserQuestion` lives only in the orchestrator
skill (`skills/run`); `craft-pi` (the non-Claude entrypoint) ignores stdin and has no
interactive user — the P23 precedent for the headless contrast.

## Options considered

1. **Interactive only, headless deferred** *(designer recommendation, user-confirmed)* — pros: an interview is inherently a conversation; ship the front door first. Cons: not usable from `craft-pi` yet.
2. **Interactive + a headless answer-file/flag mode now** — pros: unblocks non-Claude onboarding from day one. Cons: doubles the surface before a concrete need.

## Decision

The interview is interactive-only for P25, driven by the orchestrator's `AskUserQuestion`. A
headless/answer-file transport is deferred until a concrete non-Claude onboarding need exists.
**Adopted-as-recommended (no user judgment)** — the user confirmed the designer's
recommendation.

## Consequences

- `craft:init` is a Claude-orchestrated skill; no headless binding ships in P25.
- A follow-up backlog item captures the headless answer-file mode.
