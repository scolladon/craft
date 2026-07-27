# 273 — README manifest snippets are validated in-process via the engine validator

- **Status:** accepted
- **Date:** 2026-07-25
- **Design:** docs/design/readme-drift-guards.md · **Supersedes/Refines:** 272

## Context

The README's fenced `yaml` manifest example must always be a valid craft manifest.
`scripts/manifest-lint.sh` validates manifest *files*; a README snippet is
frontmatter-shaped content only, so some wrapping is required either way.

## Options considered

1. **Reuse engine extractFrontmatter + validateManifest in-process** *(designer
   recommendation)* — pros: the exact validation path manifest-lint.sh delegates to; no
   temp file, no subprocess / cons: coupled to the engine internals it reuses.
2. **mktemp wrap + shell manifest-lint.sh** — pros: black-box end-to-end (pinned:
   valid→0, unknown-key→2) / cons: temp-file I/O + subprocess per snippet; the bash-home
   mechanism, moot after ADR-272.

## Decision

Wrap each README `yaml` block as `---\n<block>\n---\n<dummy body>` in memory and run
the engine's `extractFrontmatter` → yaml load → `validateManifest`. Every `yaml` block
in the README is validated; zero blocks found is reported as drift, never a silent pass.

## Consequences

A README example using an unknown or misshapen key fails CI with the validator's own
error. Future manifest examples added to the README are covered automatically.
