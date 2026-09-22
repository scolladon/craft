---
subjects:
  - scripts/run-ledger.sh
  - skills/run/SKILL.md
  - docs/contributing/specs/run-record.md
supersedes:
  - adr: "300"
    scope: "one .claude/craft-run-record.md file in the working tree shared by every run"
  - adr: "301"
    scope: "the ledger dies with the worktree, so the memory delta is derived before teardown"
  - adr: "383"
    scope: "in-tree ledgers guarded by a case-insensitive tracked check, and the scratch-then-move hand-off"
---
# 384 — The run ledger lives in the git common dir, one file per run

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** supersedes ADR-300, ADR-301 and ADR-383 (the scopes below)

## Context

This change is the first to read the ledger back as authority: the reorient hook injects it
into the model's context, and the rebuild procedure resumes the run from it. Every review
cycle then found a new way a cloned repository controls an in-tree ledger path: a
committed file, a case variant on a case-insensitive filesystem, a submodule mounted at
`.claude`. Each patch left the class open, because the file sat where commits land.

## Options considered

1. **Keep the in-tree ledger and patch each vector** — pros: smaller diff / cons: the trust
   check grows with every vector found, and the next review finds another.
2. **Move the ledger into the git common dir beside the pointer, one file per run**
   *(recommended)* — pros: no run file is ever in a working tree, so the whole class is
   gone; the ledger outlives teardown, so no snapshot or delta file is needed / cons:
   supersedes three ADRs and churns the skills, the spec and the tests.

## Decision

Ratified by the user: option 2. Each run's ledger is
`<git-common-dir>/craft-runs/<run-id>.md`, created by `open` at §0 step 4 and removed by
`close` at `Done`. Nothing moves it, whatever the workspace strategy. `run-ledger.sh`
keeps `open`, `append`, `locate`, `close` and `dir`, and refuses to run outside a git
work tree.

Superseded from ADR-300: one `.claude/craft-run-record.md` in the working tree for every
run.

Carried forward from ADR-300: the ledger is append-only, one run-id-prefixed line per
record, and never merged into the metrics file or the memory store.

Superseded from ADR-301: the ledger dying with the worktree, and the memory delta being
derived before teardown because of it.

Carried forward from ADR-301: the ledger is run-local and never committed, with no
`.gitignore` change.

Superseded from ADR-383: in-tree ledgers guarded by a case-insensitive tracked check, and
the scratch-then-move hand-off it carried forward.

Carried forward from ADR-383: every run file lives under the git common dir, where no
commit can write.

## Consequences

- `move`, `snapshot`, `--in-place` and the delta file disappear; `Done` derives the delta
  from the ledger after teardown.
- A second run of the same topic starts from a fresh ledger: `open` writes it anew.
- The run record no longer needs rescuing before teardown.
