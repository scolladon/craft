#!/usr/bin/env bats

load helpers/worktree

SCRIPTS_DIR="${BATS_TEST_DIRNAME}/../scripts"

REPO=""
WT=""
POST_SCRIPT=""

setup() {
  REPO="$(mktemp -d "${BATS_TMPDIR}/craft-repo-XXXXXX")"
  WT="$(mktemp -d "${BATS_TMPDIR}/craft-wt-XXXXXX")"
  rm -rf "$WT"  # worktree add requires the target to not yet exist
  mk_worktree "$REPO" "$WT" "craft-test-branch"
}

teardown() {
  rm -rf "$REPO" "$WT"
  if [ -n "$POST_SCRIPT" ]; then rm -f "$POST_SCRIPT"; fi
}

# ---------------------------------------------------------------------------
# worktree-setup.sh — no lockfile branch
# ---------------------------------------------------------------------------

@test "Given a worktree dir with no lockfile, when setup runs, then it exits 0 and reports skipped (noted)" {
  run bash "${SCRIPTS_DIR}/worktree-setup.sh" "$WT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"dependency install skipped (noted)"* ]]
}

@test "Given a worktree with a nested engine/package-lock.json, when setup runs, then it selects the nested npm branch (npm stubbed, no real install)" {
  mkdir "$WT/engine"
  touch "$WT/engine/package-lock.json"

  # A PATH npm stub pins branch-selection + message without depending on a real
  # npm or a network-free install — the script aborts under set -e if the nested
  # `npm ci || npm install` fails, so the stub exiting 0 keeps the test hermetic.
  local stub_dir
  stub_dir="$(mktemp -d "${BATS_TMPDIR}/craft-npmstub-XXXXXX")"
  printf '#!/bin/sh\nexit 0\n' > "$stub_dir/npm"
  chmod +x "$stub_dir/npm"

  PATH="$stub_dir:$PATH"
  run bash "${SCRIPTS_DIR}/worktree-setup.sh" "$WT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"installed in-worktree via npm (nested: engine)"* ]]

  rm -rf "$stub_dir"
}

# ---------------------------------------------------------------------------
# worktree-setup.sh — post-setup script branch
# ---------------------------------------------------------------------------

@test "Given a worktree dir and a post-setup script, when setup runs, then it exits 0 and reports the script ran" {
  POST_SCRIPT="$(mktemp "${BATS_TMPDIR}/post-XXXXXX.sh")"
  chmod +x "$POST_SCRIPT"
  printf '#!/bin/sh\n' > "$POST_SCRIPT"

  run bash "${SCRIPTS_DIR}/worktree-setup.sh" "$WT" "$POST_SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"post-setup script ran:"* ]]
  [[ "$output" == *"$POST_SCRIPT"* ]]
}

# ---------------------------------------------------------------------------
# worktree-teardown.sh — live-lock refusal (no --force)
# ---------------------------------------------------------------------------

@test "Given a live-PID lock in the worktree, when teardown runs without --force, then it exits 3 and reports REFUSED" {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s %s\n' "$$" "$ts" > "${WT}/.craft-validation.lock"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$REPO" "$WT"
  [ "$status" -eq 3 ]
  # REFUSED is emitted to stderr; bats merges stderr into $output by default.
  [[ "$output" == *"REFUSED"* ]]
  [[ "$output" == *"validation run alive"* ]]
  # Refusal must leave the live lock intact — never clear a lock it would not honour.
  [ -f "${WT}/.craft-validation.lock" ]
}

# ---------------------------------------------------------------------------
# worktree-teardown.sh — live-lock forced past
# ---------------------------------------------------------------------------

@test "Given a live-PID lock in the worktree, when teardown runs with --force, then it exits 0, reports FORCED, and removes the lock" {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s %s\n' "$$" "$ts" > "${WT}/.craft-validation.lock"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$REPO" "$WT" --force
  [ "$status" -eq 0 ]
  [[ "$output" == *"FORCED past live validation run"* ]]
  [ ! -f "${WT}/.craft-validation.lock" ]
  # --force proceeds to full teardown, so the worktree itself is gone.
  [ ! -d "$WT" ]
}

# ---------------------------------------------------------------------------
# worktree-teardown.sh — stale-lock auto-cleared
# ---------------------------------------------------------------------------

@test "Given a stale-PID lock in the worktree, when teardown runs, then it reports stale lock auto-cleared and removes the worktree" {
  local ts dead_pid
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # A reaped child PID is provably dead — more reliable than a fixed high number,
  # which can be a live process where pid_max is large (e.g. Linux CI).
  ( exit 0 ) &
  dead_pid=$!
  wait "$dead_pid" 2>/dev/null || true
  printf '%s %s\n' "$dead_pid" "$ts" > "${WT}/.craft-validation.lock"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$REPO" "$WT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"stale lock"* ]]
  [[ "$output" == *"auto-cleared"* ]]
  [ ! -d "$WT" ]
  # Teardown prunes the non-default branch it removed the worktree for.
  ! git -C "$REPO" rev-parse --verify --quiet refs/heads/craft-test-branch
}

# ---------------------------------------------------------------------------
# worktree-teardown.sh — no-remote repo (the `git fetch --prune` abort)
# ---------------------------------------------------------------------------

@test "Given a worktree on a repo with no remote, when teardown runs, then it exits 0 and removes the worktree and branch" {
  local repo wt
  repo="$(mktemp -d "${BATS_TMPDIR}/craft-norem-repo-XXXXXX")"
  wt="$(mktemp -d "${BATS_TMPDIR}/craft-norem-wt-XXXXXX")"
  rm -rf "$wt"
  mk_worktree_no_remote "$repo" "$wt" "norem-branch"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$repo" "$wt"
  [ "$status" -eq 0 ]
  [[ "$output" == *"worktree removed"* ]]
  [ ! -d "$wt" ]
  ! git -C "$repo" rev-parse --verify --quiet refs/heads/norem-branch

  rm -rf "$repo" "$wt"
}

# ---------------------------------------------------------------------------
# worktree-teardown.sh — non-canonical PID is not a live process
# ---------------------------------------------------------------------------

@test "Given a lock whose PID is -1 (kill -0 -1 signals a process group), when teardown runs, then the numeric guard treats it as stale, not live" {
  printf '%s %s\n' "-1" "2026-01-01T00:00:00Z" > "${WT}/.craft-validation.lock"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$REPO" "$WT"
  [ "$status" -eq 0 ]
  [[ "$output" != *"REFUSED"* ]]
  [[ "$output" == *"stale lock"* ]]
  [ ! -f "${WT}/.craft-validation.lock" ]
}

# ---------------------------------------------------------------------------
# worktree-teardown.sh — realpath guard protects the main checkout
# ---------------------------------------------------------------------------

@test "Given WT and MAIN that resolve to the same path via different spellings, when teardown runs, then it does not attempt a worktree remove" {
  local repo
  repo="$(mktemp -d "${BATS_TMPDIR}/craft-same-XXXXXX")"
  git init -q "$repo"
  git -C "$repo" config user.email "test@craft"
  git -C "$repo" config user.name  "craft-test"
  git -C "$repo" commit --allow-empty -q -m "init"
  git -C "$repo" branch -M main

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$repo" "$repo/."
  [ "$status" -eq 0 ]
  [[ "$output" != *"worktree removed"* ]]
  [ -d "$repo" ]

  rm -rf "$repo"
}
