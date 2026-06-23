# 137 — P25 ships end-to-end: a new `--config <name>` token resolves `.claude/craft-<name>.md`

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P25-interactive-manifest-generator.md · **Supersedes/Refines:** Refines 136

## Context

ADR-136 makes a named customization a file `.claude/craft-<name>.md`. A file craft cannot
load by name is inert config. The design had deferred named-manifest resolution to a
follow-up (explicit "out of scope"); the user pulled it into P25 so the feature is usable on
landing. Today the orchestrator parses `--profile <name>` (expands an execution-archetype
map) and separately selects *which manifest file to read* (always `.claude/workflow.md`),
passing that path to `manifest-lint` + `pipeline-resolve` — both of which already accept an
arbitrary manifest path. "profile" already carries a precise, narrow meaning (execution map).

## Options considered

1. **Generator only, resolution deferred** *(designer scope)* — pros: smaller change. Cons: the named file is inert until a follow-up lands.
2. **Reuse `--profile <name>`, file-wins precedence** — pros: one user-facing word. Cons: overloads "profile" (sometimes a full manifest, sometimes an exec map), disambiguated by file existence — magical.
3. **New `--config <name>` token, end-to-end** *(user choice)* — pros: keeps "profile" precise (exec map) and "config" distinct (full named manifest); explicit, no file-existence magic. Cons: a second naming concept.

## Decision

P25 ships both the generator and the consumption path. A new per-invocation `--config <name>`
token makes the orchestrator resolve `.claude/craft-<name>.md` as the manifest for that run
(the manifest-path selection step; the bins already take an arbitrary path, so the engine
bins are unchanged). `--profile` remains strictly the execution-archetype map. `--config`
composes with the existing overlay: the named file *is* the manifest, and
`--profile`/`--skip`/`--harness`/`--policy` still fold over it at highest precedence
(ADR-022). A `--config <name>` whose file is absent is a loud blocker, never a silent
fallback to the default manifest.

## Consequences

- The orchestrator (`skills/run`) gains a `--config <name>` parse + manifest-path resolution,
  resolved *before* the lint/resolve steps; `manifest-lint`/`pipeline-resolve` are unchanged.
- "profile" and "config" are distinct first-class concepts: profile = execution map; config =
  full named manifest.
- `--config` and `--profile` can combine (a named config that itself sets `pipeline.profile`,
  optionally overridden by a CLI `--profile`).
- The documentation phase records the scope shift (the design's out-of-scope note is now in
  scope).
