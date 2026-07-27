# 231 — the `/craft:*` entrypoint is a thin pi prompt-template

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Refines ADR-229

## Context

The opencode binding renders `/craft:run` as a thin `commands/craft-run.md` dispatcher (ADR-216). Live-pinning confirmed pi **does** expose in-session slash commands, both via prompt-templates (`/<filename>` with `$ARGUMENTS`) and via extension `registerCommand` (arbitrary name, including a literal `craft:run`). A choice is needed for which native mechanism renders the entrypoint.

## Options considered

1. **Prompt-template `/craft-run` (thin, `$ARGUMENTS`) that loads the craft-run skill** *(designer recommendation)* — pros: thin + arg-templated + single-sourceable; defers procedure text to the skill; the closest native analog to opencode's `commands/`. Cons: colon-in-filename is avoided, so `/craft:run` renders as `/craft-run`.
2. **Skill `/skill:craft-run`** — cons: less command-like; no arg-hint affordance.
3. **Extension `pi.registerCommand("craft:run", handler)`** — pros: can keep the literal `craft:run` name. Cons: pulls dispatch logic into JS.

## Decision

*Ratified by the user* (as part of the surface-shape choice, ADR-229). Option 1. Each exposed phase gets a thin prompt-template under `adapters/pi/prompts/` (`craft-run.md`, `craft-review.md`, `craft-validation.md`, `craft-init.md`, …); its body is `description` + `$ARGUMENTS` instructing the model to load the corresponding craft skill and run the phase. `/craft:run` is rendered pi-natively as `/craft-run`.

## Consequences

- The entrypoint carries no procedure text (single-sourced from the skill, R-2); it carries no shell invocation (pi does not expand shell in templates, ADR-229 consequence).
- The `/craft:run`→`/craft-run` rename is the accepted nearest-native affordance (design Out of scope: byte-identical Claude affordances are not a goal).
- Clean per-phase-dynamics threading through a live template is DEFERRED to the smoke (design §D2 row 26).
