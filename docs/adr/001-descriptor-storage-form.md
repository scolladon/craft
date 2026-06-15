# 001 — Phase descriptor storage form

- **Status:** accepted
- **Date:** 2026-06-15
- **Design:** docs/DESIGN-customizable-engine.md · **Supersedes/Refines:** none

## Context

P3 introduces a declarative phase-descriptor list (PRD §6.1) the engine walks. It must be
editable by the manifest, machine-validatable so P1 can fixture-test the graph/consistency,
and consistent with the repo's house style. The orchestrator is an LLM, so a markdown table
would read "natively" — but it is not script-checkable.

## Options considered

1. **YAML data file** (`pipeline/default.yml`) — same parser family as the manifest;
   machine-validatable + fixture-testable / adds a parser dependency. *(recommended)*
2. **Markdown table in `run/SKILL.md`** — most LLM-native, no parser / not script-validatable;
   the acyclicity/consumes checks become LLM-driven (weaker for P1).
3. **JSON data file** — trivial `jq` parsing / less human-friendly, diverges from the YAML
   house style.

## Decision

The default pipeline ships as a **YAML data file** (`pipeline/default.yml`). It is engine data,
parsed and validated mechanically (ADR-002), edited by the manifest into the effective pipeline.

## Consequences

Adds a YAML parse step to the core; pairs with ADR-002 (the Node resolver owns parsing).
Enables fixture-based graph/consistency tests (P1). The orchestrator consumes resolved data,
never re-parses prose.
