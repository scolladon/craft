# 229 — the native pi surface is prompt-templates + single-sourced skills + one extension

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Refines ADR-216 (opencode single-sourced thin dispatchers)

## Context

pi 0.80.10 exposes three first-class discoverable mechanisms (live-pinned, design §D2 rows 7/9/10/12): skills (`/skill:<name>`, discovered under package `skills/` + settings `skills[]` reading arbitrary/`.claude`-style dirs), prompt-templates (`/<file>` with `$ARGUMENTS`, no shell-injection at expansion), and extensions (`export default function(pi)` with `registerCommand`/`registerFlag`/`on`). The native binding must offer a discoverable `/craft:*`-equivalent while keeping the invariant procedure text single-sourced from the shared craft skill bodies (the R-G2 no-re-authoring rule opencode already holds).

## Options considered

1. **Prompt-template `/craft-*` thin dispatchers + single-sourced skills (via `skills[]`) + one extension (guard/flag/CRAFT_ROOT)** *(designer recommendation)* — pros: uses pi's first-class discoverable + single-sourceable surfaces; skills carry the single-sourced rules; the prompt template is the closest native analog to opencode's thin `commands/`; the extension is the minimal code seam. Cons: three resource kinds to package (all in one `pi install`).
2. **Skills only (`/skill:craft-*`), no prompt templates** — pros: fewer moving parts. Cons: loses a clean `/craft-*` entrypoint and arg-templated dispatch.
3. **One extension with `registerCommand("craft:run")` driving everything in JS** — pros: keeps the literal `craft:run` name. Cons: re-authors procedure text in JS (drift; violates R-G2).

## Decision

*Ratified by the user.* Option 1. The native pi surface is: thin prompt-template `/craft-*` dispatchers (`adapters/pi/prompts/`), single-sourced skill bodies exposed via a settings `skills[]` entry pointing at the craft skill directories (no procedure text re-authored), and exactly one extension (`adapters/pi/extensions/craft-guard/`) carrying the code seams (tool_call guard, `registerFlag`, CRAFT_ROOT export). All three ship as one pi package installed via `pi install ./adapters/pi`.

## Consequences

- Procedure invariants stay single-sourced; a phase-body edit propagates to pi with zero re-authoring (R-2).
- Prompt templates carry no engine-bin invocation themselves (pi does not run shell at expansion, row 10); the *skill body* instructs the model to run `node ${CRAFT_ROOT}/engine/bin/*` via the bash tool.
- Threading per-phase dynamics (phase id + part text + gate + artifact paths) through a live TUI prompt-template/skill is a DEFERRED live-smoke item (design §D2 row 26).
