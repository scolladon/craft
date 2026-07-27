# 130 — Headless `ask` pre-approval reuses the per-invocation `--policy <action>=always` overlay

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P23-configurable-policy-hooks.md · **Supersedes/Refines:** none

## Context

Under the headless (`pi`) binding there is no interactive user, so a resolved `ask` verdict cannot be
answered live. The brief mandates `ask` ⇒ treat as `never`/blocker **unless pre-approved**.
Pre-approval needs a channel, and craft already has a per-invocation overlay surface for policy.

## Options considered

1. **Reuse `--policy <action>=always` per-invocation** *(designer recommendation)* — pros: no new mechanism; pre-approval *is* a per-invocation `always` that rides the precedence model already built. Cons: none material.
2. **Dedicated `--approve <action,…>` flag** — pros: explicit intent. Cons: a second parallel surface to validate and precedence-order.
3. **Env var / approvals file** — pros: out-of-band. Cons: a third config source to merge.

## Decision

*Adopted-as-recommended (no user judgment).* Headless pre-approval is expressed as a per-invocation
`--policy <action>=always` overlay passed to `craft-pi` by the operator/outer harness. The headless
binding therefore never faces a live `ask`: it either has a per-invocation `always` (proceed) or it
does not (degrade to `never`/recorded blocker). Pre-approval collapses entirely into the precedence
model from ADR-125/126.

## Consequences

- No new pre-approval surface; one precedence model serves both interactive and headless.
- A headless operator wanting unattended auto-merge passes `--policy integrate=always`, which under ADR-128 (Supersede) genuinely auto-merges.
- The `pi` binding's `ask → never` degradation is the documented default when no per-invocation `always` names the action.
