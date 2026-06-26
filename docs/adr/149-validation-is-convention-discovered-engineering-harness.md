# 149 — `validation` is a convention-discovered engineering harness, not a declared-only one

- **Status:** accepted
- **Date:** 2026-06-25
- **Design:** docs/design/despecialize-craft-sources.md · **Supersedes/Refines:** none

## Context

The design asked only *where craft declares its own mutation technique* so dogfood
coverage survives de-specialization, recommending a real `.claude/workflow.md`. The user
reframed the whole concern: mutation is just one kind of validation; `validation` is the
project's **engineering harness** (lint, test, mutation, prettier, typecheck, …). craft
must apply *whatever the project where craft runs uses to validate its workflow* —
derived from the repo's own conventions — not a craft-declared fixed technique. This is
the brief's "probe-or-declare … discovered by capability probing", made concrete about
*what is probed*.

The engine must stay technique-agnostic. The resolution: the **engine** carries only the
opaque `harness.techniques` knob + emitted plan; the **validation skill** (LLM-executed)
performs the discovery by reading the repo's docs/config. The engine never parses prose;
the skill does the judgment, exactly as skills already discover the gate test command.

## Options considered

1. **Convention discovery in the skill** *(user choice)* — declared `validation.techniques` wins; absent declaration, the skill derives the harness from the repo's README / CONTRIBUTING / craft config; absent those, it falls back to the test command deduced from the language manifest; only when nothing is found does it cleanly no-op. Pros: applies the project's *real* validation workflow with zero config; keeps engine agnostic. Cons: discovery is LLM-judgment (covered by scenario fidelity, not CI-unit), like the existing gate probe.
2. **Declared-only (`.claude/workflow.md`)** *(designer recommendation)* — craft declares mutation explicitly. Pros: simplest. Cons: every consumer must hand-declare; "nothing declared" silently no-ops instead of validating with the repo's own harness.
3. **Auto-detect by tool config filename** — Cons: reintroduces technique names into the skill (`stryker.conf` ⇒ mutation) — the exact smell being removed.

## Decision

*User judgment.* `validation` discovers its technique set in precedence order:

1. **Declared** — `phases.validation.harness.techniques` in craft config (manifest) wins outright.
2. **Derived** — absent a declaration, the skill reads the repo's own validation conventions (README / CONTRIBUTING / craft config) and derives one technique per documented validation command (lint, test, format, typecheck, mutation, …), each GATE (pass/fail command) or TRIAGE (mutation-style) per its nature.
3. **Fallback** — absent any documented convention, the test command deduced from the language manifest (the existing gate-command capability probe) runs as a single GATE technique.
4. **Clean no-op** — only when none of the above yields a technique does the phase record the no-op token and release its `propose`-gate entry.

Discovery is **skill (LLM) judgment**, never engine code; `engine/src` names no technique.
mutation is demoted to one ordinary derivable/declarable technique among many.

## Consequences

- The brief's "zero **declared** techniques → clean no-op" still holds for an explicit
  empty declaration, but the *default* (nothing declared) derives the repo's real harness
  rather than no-opping — a deliberate strengthening of the capability-probing story.
- craft-on-craft dogfood keeps mutation coverage because craft's README/CONTRIBUTING/config
  document its mutation command; a `.claude/workflow.md` declaration is sufficient but not
  required.
- The validation skill gains a discovery step (read conventions → derive techniques);
  the engine `techniquePlan` (ADR-155) still resolves declared techniques, with derived
  ones supplied by the skill at runtime.
- Discovery quality is a skill/scenario-fidelity concern, not a CI-unit invariant — the
  same home as the gate-command and (former) mutation-tooling probes.
