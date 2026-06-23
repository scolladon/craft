# 138 — `craft:init` writes the named config by direct overwrite, lint-gated

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P25-interactive-manifest-generator.md · **Supersedes/Refines:** Refines 136

## Context

The design recommended a review-draft-then-land output mode (DC-4) to avoid clobbering a
working manifest mid-generation, paired with confirm-then-overwrite for an existing manifest
(DC-7). ADR-136 changed the premise: the target is a *dedicated* named file
`.claude/craft-<name>.md`, not the repo's live `.claude/workflow.md`. Overwriting a named
config the user explicitly named (by re-running `craft:init` for that name) affects only that
one named config; the live manifest is never at risk.

## Options considered

1. **Review draft, land on confirm (+ confirm-then-overwrite)** *(designer recommendation)* — pros: never clobbers a working manifest. Cons: an extra step, and the clobber risk it guards against no longer applies to a dedicated named file.
2. **Direct write, overwrite `.claude/craft-<name>.md`** *(user choice)* — pros: ergonomic, idempotent regeneration of a named config; the live `.claude/workflow.md` is never endangered. Cons: re-running for an existing name replaces it without a diff preview.
3. **Stdout-only** — cons: least ergonomic; the user lands it by hand.

## Decision

`craft:init` writes `.claude/craft-<name>.md` by direct write, overwriting an existing file of
the same name. The candidate is lint-validated (`manifest-lint`) before it is considered
landed; a lint failure STOPs and leaves no INVALID file on disk (emit to a temp path, lint,
move into place only on exit 0). Because the target is a dedicated named sibling file, direct
overwrite never endangers the repo's live `.claude/workflow.md`. The user chose direct
overwrite over the review draft, deviating from the recommendation; the premise that
justified the draft (clobbering the live manifest) no longer holds under ADR-136.

## Consequences

- Re-running `craft:init` for an existing name regenerates that named config in place
  (idempotent by design).
- Lint runs before landing regardless; an INVALID emit never lands (R2/R8 preserved).
- The repo's live manifest and any other named configs are untouched by a given run.
