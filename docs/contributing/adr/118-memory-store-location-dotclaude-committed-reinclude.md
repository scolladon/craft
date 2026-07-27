# 118 — The memory store lives at `.claude/craft-memory.md`, committed via a repo gitignore re-include

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P22-repo-local-craft-memory.md · **Supersedes/Refines:** none

## Context

The store must be local to the target repo (HARD CONSTRAINT) and, per the brief's rationale, learnings
should travel with the repo (committed). Live spike finding: the user's global `~/.gitignore` excludes
every `.claude/` directory, so a `.claude/`-path store is silently gitignored unless the repo
re-includes it — exactly the pattern this repo already uses for its sample manifests (ADR-063, repo
`.gitignore` `!`-lines). This couples the location choice and the commit choice into one decision.

## Options considered

1. **Committed non-dotfile path** (e.g. `craft-memory.md` / `docs/craft-memory.md`), configurable
   *(designer recommendation)* — pros: commits with no re-include. Cons: a visible top-level/docs
   artifact, not co-located with `.claude/workflow.md`.
2. **`.claude/craft-memory.md` + repo re-include** *(chosen — user judgment)* — pros: conventional
   dotfile home alongside `.claude/workflow.md`. Cons: requires the repo to add a `!`-re-include or
   the store will not commit under the global ignore.
3. **Default gitignored** — pros: no diff noise. Cons: learnings don't travel with the repo (counter
   to the brief).

## Decision

The store lives at **`.claude/craft-memory.md`** (path overridable via the `memory:` key, ADR-121) and
is **committed** by having the build add a `.gitignore` re-include for the store path (the ADR-063
sample-manifest pattern). A repo that wants it private removes the re-include or gitignores the path.

## Consequences

- The build must emit/maintain a `.gitignore` re-include for the configured store path; the default
  ships one for `.claude/craft-memory.md`.
- The separate metrics artifact (ADR-119) lives alongside (`.claude/craft-metrics.md`) and needs the
  same re-include.
- Keys discovery to the repo's `.claude/` dir, parallel to `.claude/workflow.md`, reinforcing
  "repo under work" rooting (design Req 1).
- Deviates from the design recommendation → triggers a design revision (scope-fold) before planning.
