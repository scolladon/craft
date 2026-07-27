# 095 — `craft-pi` headless semantics for the role-less phases

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P17-pi-adapter-productization.md · **Supersedes/Refines:** refines ADR-093

## Context

The full 11-phase walk (ADR-093) includes four **role-less** phases — `workspace`, `decisions`,
`propose`, `integrate` — that in the Claude adapter are *session-owned*, driven interactively by the
orchestrator (branch/worktree setup, the ADR conversation, PR creation, merge confirmation). The
`craft-pi` bin is **non-interactive** (`pi -p`, stdin ignored), so each needs a defined **headless**
behaviour — never an LLM run, never a silent skip, always recorded.

Framing that guides these choices: the Pi adapter is a **portability example** (the reference for how to
adapt craft to other agents — codex, copilot, …), not a production unattended runner; the framework is
dogfooded with Claude. So each role-less phase should model the *safe, minimal, exemplary* behaviour.

## Options considered

- **`workspace` (DC-WS):** (a) run inside an already-prepared checkout, assert a repo, create no worktree
  *(chosen)*; (b) self-create a worktree via `worktree-setup.sh`; (c) take a `--target-dir`.
- **`decisions` (DC-DEC):** (a) recorded no-op, proceed *(chosen)*; (b) consume a pre-supplied answers
  file else no-op; (c) drive `pi` to self-author ADRs.
- **`propose` (DC-PROP):** (a) push + `gh pr create` iff remote+`gh`+auth present, else recorded no-op
  *(chosen)*; (b) hard blocker when no remote; (c) attempt always, surface raw errors.
- **`integrate` (DC-INT):** (a) stop-before-merge — a human merges *(chosen, no auto-merge built)*;
  (b) opt-in auto-merge behind a flag; (c) full auto-merge.

## Decision

Each role-less phase runs a defined, recorded headless step:

- **`workspace`** — assume the launcher's checkout is the work tree; assert a git repo and record;
  create no worktree (isolation is the caller's concern, exactly as the P16 smoke ran in a `mktemp`).
- **`decisions`** — a recorded no-op ("no interactive user to ratify forks"), consistent with the
  decisions phase's zero-candidate honest-skip and BACKLOG P19 (a clean no-op is a first-class outcome).
- **`propose`** — deterministic `git push -u` + `gh pr create` when a remote, `gh`, and auth are present;
  otherwise a recorded no-op (matches `skills/propose`: "no remote → propose AND integrate no-op").
- **`integrate`** — **stop-before-merge**: the PR is open / the branch pushed, then the bin STOPs and
  records; a human performs the merge. **No auto-merge is built.** Merge is irreversible and
  outward-facing, and a reference example must not teach an unattended-merge-to-trunk pattern.

## Consequences

- `craft-pi` performs **no irreversible or outward-facing action without a human** — the final merge is
  always a human's. The example models the safe pattern.
- The adapter stays minimal: opt-in auto-merge (DC-INT b), a pre-supplied decisions/answers file
  (DC-DEC b), and a `--target-dir` / bin-created worktree (DC-WS c) are documented future extensions for
  anyone who later wants a production unattended runner.
- Every role-less step is DI'd and unit-tested (git/gh/fs doubles), so the headless behaviour is
  CI-proven without a live `pi`, remote, or `gh`.
