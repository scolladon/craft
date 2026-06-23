# 136 — A named craft customization is a full named manifest file `.claude/craft-<name>.md`

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P25-interactive-manifest-generator.md · **Supersedes/Refines:** none

## Context

P25 scaffolds a *named* customization. The design surfaced three mechanically-distinct
bindings for what "name" means (DC-1): a craft "profile" carries only a 6-archetype
execution map (`inline|agent`) — it cannot hold `models`/`gates`/`pipeline.skip`/`harness`/
`policy` — so a name meant to bundle a *full* customization has no home in a profile today.
The question is whether the name is documentation-grade, an execution-only profile, or a
first-class file that carries any config.

## Options considered

1. **(C) Prose/metadata identity in `.claude/workflow.md`** *(designer recommendation)* — pros: zero engine change, lint-clean today. Cons: the name is documentation-grade only; the customization *is* the single live manifest, so one repo holds exactly one.
2. **(A) Registered execution profile `extends.profiles.<name>`** — pros: real today, resolves via `pipeline.profile`. Cons: captures only execution topology; every non-execution answer lands as loose keys not bound to the name.
3. **(B) A full named manifest file `.claude/craft-<name>.md`** *(user choice)* — pros: the name is first-class and carries *any* config; multiple named configs coexist in one repo. Cons: needs a resolution path so craft can load it by name (ADR-137).

## Decision

A named customization is a complete manifest (YAML frontmatter + markdown prose, the exact
shape `validateManifest` accepts) stored at `.claude/craft-<name>.md`. The file name is the
customization's identity; multiple named configs coexist in one repo as siblings of the live
`.claude/workflow.md`. The user chose the most expressive binding over the zero-engine MVP,
deviating from the recommendation.

## Consequences

- A new resolution path is required so craft loads `.claude/craft-<name>.md` by name
  (ADR-137); the design doc's "named-manifest resolution out of scope" note is overridden.
- `craft:init` emits only keys `validateManifest` already accepts — no schema change.
- The repo's live default `.claude/workflow.md` is never touched by a named config; named
  configs are additive siblings, not replacements.
