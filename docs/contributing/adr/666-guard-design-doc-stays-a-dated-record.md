---
subjects:
  - docs/contributing/design/copilot-git-argv-normalising-guard.md
supersedes: []
---
# 666 — The copilot guard design doc stays a dated record

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/copilot-write-bash-pty-probe.md · **Supersedes/Refines:** none

## Context

`docs/contributing/design/copilot-git-argv-normalising-guard.md` says, in its Context and Out of
scope, that an interactive pty `write_bash` session was not probed. That probe has now run on
copilot 1.0.98. Design docs in this repo are not edited after merge: this one's only later commit
is a repo-wide home-path scrub, and the codex `write_stdin` close left earlier design docs alone.

## Options considered

1. **Leave it as a dated record** *(recommended)* — pros: keeps design docs as snapshots of what
   was known when they were written; the living pages carry the current fact / cons: a reader of
   that doc alone sees the old state
2. **Append a dated superseded note** — pros: points the reader forward / cons: starts a habit of
   editing merged design docs
3. **Rewrite the two lines in place** — pros: the doc reads current / cons: rewrites history the
   doc's own decisions were made against

## Decision

Ratified by the user: option 1. The guard design doc is not changed. The current fact lives in the
PoC record, `gate.md` and the copilot adapter README.

## Consequences

The living pages are the source for the `write_bash` status. Merged design docs stay snapshots.
