---
subjects:
  - evals/**
  - docs/contributing/maintainer-smokes.md
---
# 386 — Eval fixtures reach the sandbox through a per-case scaffold script

- **Status:** accepted
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

craft phases operate on a git repo: the reviewer needs a commit range, decisions and planning write under `docs/`. An eval child starts in an empty sandbox git repo. The CLI offers `context.scaffold_script` (runs only with `--scaffold`, as the operator) and `context.add_dirs` (read access to dirs inside the case or plugin); both are `case.yaml`-only keys, prompt.md frontmatter rejects them.

## Options considered

1. **Per-case `scaffold.sh` copying case-local `fixture/` into cwd and committing** *(recommended)* — pros: real files and history in cwd / cons: the documented run passes `--scaffold`, which runs that bash as the maintainer
2. **`context.add_dirs` read grant** — pros: no bash / cons: copies nothing, no history, path discovery in the child unpinned
3. **Fixture embedded in the prompt** — pros: self-contained / cons: cannot express history, inflates the prompt

## Decision

Ratified by the user: option 1. Each fixture case carries a `case.yaml` (`schema_version: "1.0"`, `context.scaffold_script: scaffold.sh`) and a scaffold of at most 10 lines that copies its own `fixture/` (or the plugin's live `contracts/`) into cwd and commits it. The documented full-suite command passes `--scaffold` with its reason stated beside it.

## Consequences

- Scaffolds are craft-authored and reviewed like any script; a scaffold that grows past a plain copy-and-commit is a review finding.
- Without `--scaffold` the fixture cases score 0 in both arms and the CLI prints the unstaged-workspace notice; the procedure names that symptom.
- No fixture may contain `.claude/` or a file named `prompt.md`/`case.yaml`.
