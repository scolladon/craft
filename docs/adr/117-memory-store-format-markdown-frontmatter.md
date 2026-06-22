# 117 — The memory store is a single markdown file with YAML frontmatter

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P22-repo-local-craft-memory.md · **Supersedes/Refines:** none

## Context

The store must be human-readable and diffable (design Req 7) so a reviewer can audit what craft
learned, while staying machine-parseable for load/save. The repo already ships diffable committed
artifacts in markdown (`docs/model-class-matrix.md`), and the harness's own memory uses markdown +
frontmatter.

## Options considered

1. **Single markdown + YAML frontmatter** *(designer recommendation)* — pros: human-readable +
   diffable, one file keeps the atomic flush trivial, frontmatter is machine-parseable. Cons: parsing
   is less rigid than JSON.
2. **Single JSON file** — pros: parse-clean and unambiguous. Cons: review-hostile in a `git diff`.
3. **`.claude/`-style dir of files** — pros: per-concern separation. Cons: complicates the atomic
   flush, invites partial poisoning.

## Decision

*User decision (escalated).* The store is a **single markdown file with YAML frontmatter**. One file
preserves the single-atomic-flush property and the diffable-audit property; structured frontmatter
carries the machine-readable entries.

## Consequences

- Atomic flush stays a single temp-write + rename of one file.
- Entries are reviewable via `git diff`; pairs with the document-only whitelist (ADR-123), since a
  human can spot non-conforming content in review.
- The byte cap (ADR-122) is measured on this one serialized file.
