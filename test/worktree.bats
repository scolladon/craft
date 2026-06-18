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

@test "Given a worktree with a nested engine/package-lock.json, when setup runs, then it installs via the nested dir" {
  mkdir "$WT/engine"
  touch "$WT/engine/package-lock.json"
  echo '{}' > "$WT/engine/package.json"
  run bash "${SCRIPTS_DIR}/worktree-setup.sh" "$WT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"installed in-worktree via npm (nested: engine)"* ]]
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
  printf '%s %s\n' "$$" "$ts" > "${WT}/.craft-mutation.lock"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$REPO" "$WT"
  [ "$status" -eq 3 ]
  # REFUSED is emitted to stderr; bats merges stderr into $output by default.
  [[ "$output" == *"REFUSED"* ]]
  [[ "$output" == *"mutation run alive"* ]]
  # Refusal must leave the live lock intact — never clear a lock it would not honour.
  [ -f "${WT}/.craft-mutation.lock" ]
}

# ---------------------------------------------------------------------------
# worktree-teardown.sh — live-lock forced past
# ---------------------------------------------------------------------------

@test "Given a live-PID lock in the worktree, when teardown runs with --force, then it exits 0, reports FORCED, and removes the lock" {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s %s\n' "$$" "$ts" > "${WT}/.craft-mutation.lock"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$REPO" "$WT" --force
  [ "$status" -eq 0 ]
  [[ "$output" == *"FORCED past live mutation run"* ]]
  [ ! -f "${WT}/.craft-mutation.lock" ]
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
  printf '%s %s\n' "$dead_pid" "$ts" > "${WT}/.craft-mutation.lock"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$REPO" "$WT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"stale lock"* ]]
  [[ "$output" == *"auto-cleared"* ]]
  [ ! -d "$WT" ]
  # Teardown prunes the non-default branch it removed the worktree for.
  ! git -C "$REPO" rev-parse --verify --quiet refs/heads/craft-test-branch
}
