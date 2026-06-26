# VCS adapter spec

## Port interface

- `isolate(branch) → workspacePath` — create an isolated workspace for the given branch before any
  worker is spawned; install dependencies in-isolation.
  - **pre**: the main repo is clean (the orchestrator enforces this before calling `isolate`); the
    target branch exists or will be created by the worktree mechanism.
  - **post**: an isolated workspace exists at `workspacePath`; dependencies are installed
    in-worktree (never symlinked from the main checkout); the workspace is ready for a `spawn` call.

- `commit(message) → sha` — commit the current artifact and return the commit sha; this commit IS
  the artifact handoff.
  - **pre**: the working dir contains changes to commit; the gate for this phase has exited 0 (the
    never-commit-on-red invariant — a commit on a red gate is forbidden and escalates a blocker).
  - **post**: a git commit exists with `message`; `sha` identifies it; the commit is the delivery
    artifact, not a side-effect.

- `diff(ref?) → text` — return the diff against `ref` (defaults to the previous commit when
  omitted); always passes `--no-ext-diff` so machine-parsed output is unmangled.
  - **pre**: working dir is a git repo with at least one commit.
  - **post**: returns the raw diff text; external diff tools do not alter it.

- `defaultBranch() → name` — return the repo's default branch name (e.g. `main` or `master`).
  - **pre**: the repo has a remote with a detectable default branch (typically via the host VCS CLI / git).
  - **post**: returns the branch name string; no side-effects.

- `propose(title, body) → prUrl` — open a pull request from the current branch to the default
  branch; validation/architecture triage gates must have passed before `propose` is called (core
  policy — the port receives `propose` only after those gates clear).
  - **pre**: at least one commit exists on the branch; CI is green (core enforces this ordering;
    integrate only after CI-green + user-confirm).
  - **post**: a PR exists at `prUrl`; returns the URL string.

- `integrate(prUrl) → void` — merge the PR at `prUrl` into the default branch; called only after
  CI-green + user-confirm (core policy).
  - **pre**: PR at `prUrl` is open and CI-green; user has confirmed.
  - **post**: the branch is merged; the PR is closed.

- `teardown(workspacePath) → void` — remove the isolated workspace after `integrate` completes;
  lock-aware: refuses while `.craft-validation.lock` holds a live PID; auto-clears a dead-PID lock;
  a live PID requires `--force`.
  - **pre**: `integrate` has completed (teardown only after integrate — core ordering); the
    workspace exists.
  - **post**: the worktree directory is removed; the branch is pruned from the local repo; if
    `--force` was used the event is echoed (pipeline mode records it in the run record).

## Teardown lock protocol

The validation phase writes `<worktree-root>/.craft-validation.lock` containing `<pid> <iso-timestamp>`
when background runs start, and removes it when the run lands. `worktree-teardown.sh` reads this
lock on entry:

- **Dead PID**: lock is stale — auto-cleared, teardown continues.
- **Live PID, no `--force`**: exits 3, emits `REFUSED — validation run alive (pid=... since ...)` to
  stderr; the lock is left intact.
- **Live PID, `--force`**: emits `FORCED past live validation run (pid=... since ...)`, removes the
  lock, proceeds with teardown.

## Binding set

The valid bindings are **`{ claude, pi }`**.

## Claude binding

`isolate`: call `scripts/worktree-setup.sh <worktree-path> [post-setup-script]`. The script
detects the lockfile/manifest type (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`
/ `bun.lock`, `uv.lock`, `poetry.lock`, `Cargo.toml`, `go.mod`, `Gemfile.lock`,
`composer.lock`; nested `*/package-lock.json` as a fallback) and installs in-worktree via the
matching tool. If no lockfile is found, install is skipped and noted.

`teardown`: call `scripts/worktree-teardown.sh <main-repo-dir> <worktree-path>
[--pre-teardown <script>] [--force]`. The `--pre-teardown` hook runs before the worktree is
removed.

`commit`, `diff`, `defaultBranch`, `propose`, `integrate`: `git` and `gh` CLI called directly.

## Pi binding

Pi uses the **same** `scripts/worktree-setup.sh` / `scripts/worktree-teardown.sh` scripts and the
same `git`/`gh` CLI called directly by the adapter — the worktree mechanism is not
Claude-specific. A Pi run that needs an isolated workspace calls the scripts with identical argv;
the lifecycle and lock protocol are identical to the Claude binding.

A non-git/non-worktree adapter may satisfy `isolate`/`teardown` differently (clone, container, or
branch) as long as it honours: isolated workspace · dependencies installed in-isolation · teardown
refused while a long-running job holds the lock. Core owns ordering (validation/architecture triage
gates before `propose`; `integrate` only after CI-green + user-confirm; `teardown` only after
`integrate`, lock-aware); the port owns the raw verbs.

## Failure → blocker

Adapter failure is a blocker, never a silent pass: a verb that fails (e.g. `isolate` cannot create
the worktree; `commit` on a red gate is forbidden; `teardown` refused while a live-PID lock holds)
escalates through the blocker protocol that `contracts/core.md` injects into every spawn
(`{ unit, reason, ≤3 options }`). This spec relies on that injected invariant and does not restate
it.

Failures split by where they are detectable:

**Config errors** (knowable before any verb runs): the worktree target path already exists
(`git worktree add` requires it to be absent); the main repo dir is not a git repo; the host VCS
CLI / git not installed. Caught at `isolate` time before any worker spawns.

**Runtime errors** (knowable only at runtime): `isolate` fails to add the worktree (disk full,
branch conflict); `commit` called while the gate is red (forbidden — escalates immediately);
`teardown` refused due to a live-PID lock (exit 3 — the caller may retry with `--force` after
confirming the background run is safe to destroy); `propose` or `integrate` fails (network
unavailable, auth expired, CI not green). These escalate via the blocker protocol
`{ unit, reason, ≤3 options }`.
