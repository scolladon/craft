# 142 — `craft:init` is a standalone skill, not a walk phase

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P25-interactive-manifest-generator.md · **Supersedes/Refines:** none

## Context

The generator authors config (DC-5 naming, DC-6 placement). Skill names are auto-discovered
from `skills/<name>/SKILL.md` (no `plugin.json` edit). The interview's `AskUserQuestion` only
exists in the orchestrator stance, where the session owns all user conversation.

## Options considered

- **Name:** `craft:init` *(recommendation)* / `craft:customize` / `craft:scaffold`.
- **Placement:** standalone skill *(recommendation)* / a default-off front-of-pipeline phase / both.

## Decision

The generator ships as a standalone skill named `craft:init`, invoked directly inside a target
repo — *not* a phase in the default 11-phase delivery walk. It authors config *before* a run;
making it a walk phase would entangle config-authoring with the run it configures. It mirrors
the orchestrator stance: the session probes, interviews, emits, and lints — no worker agent is
spawned. **Adopted-as-recommended (no user judgment).**

## Consequences

- New `skills/init/SKILL.md`, auto-discovered (no `plugin.json` change).
- `craft:init` is not part of `/craft:run`; it is a separate entry point that produces a
  `.claude/craft-<name>.md` later consumed via `--config <name>` (ADR-137).
