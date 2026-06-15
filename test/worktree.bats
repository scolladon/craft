#!/usr/bin/env bats

load helpers/worktree

SCRIPTS_DIR="${BATS_TEST_DIRNAME}/../scripts"

REPO=""
WT=""

setup() {
  REPO="$(mktemp -d "${BATS_TMPDIR}/forge-repo-XXXXXX")"
  WT="$(mktemp -d "${BATS_TMPDIR}/forge-wt-XXXXXX")"
  rm -rf "$WT"  # worktree add requires the target to not yet exist
  mk_worktree "$REPO" "$WT" "forge-test-branch"
}

teardown() {
  rm -rf "$REPO" "$WT"
}

# ---------------------------------------------------------------------------
# worktree-setup.sh — no lockfile branch
# ---------------------------------------------------------------------------

@test "Given a worktree dir with no lockfile, when setup runs, then it exits 0 and reports skipped (noted)" {
  run bash "${SCRIPTS_DIR}/worktree-setup.sh" "$WT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"dependency install skipped (noted)"* ]]
}

# ---------------------------------------------------------------------------
# worktree-setup.sh — post-setup script branch
# ---------------------------------------------------------------------------

@test "Given a worktree dir and a post-setup script, when setup runs, then it exits 0 and reports the script ran" {
  local post_script
  post_script="$(mktemp "${BATS_TMPDIR}/post-XXXXXX.sh")"
  chmod +x "$post_script"
  printf '#!/bin/sh\n' > "$post_script"

  run bash "${SCRIPTS_DIR}/worktree-setup.sh" "$WT" "$post_script"
  [ "$status" -eq 0 ]
  [[ "$output" == *"post-setup script ran:"* ]]
  [[ "$output" == *"$post_script"* ]]

  rm -f "$post_script"
}

# ---------------------------------------------------------------------------
# worktree-teardown.sh — live-lock refusal (no --force)
# ---------------------------------------------------------------------------

@test "Given a live-PID lock in the worktree, when teardown runs without --force, then it exits 3 and reports REFUSED" {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s %s\n' "$$" "$ts" > "${WT}/.forge-mutation.lock"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$REPO" "$WT"
  [ "$status" -eq 3 ]
  [[ "$output" == *"REFUSED"* ]]
  [[ "$output" == *"mutation run alive"* ]]
}

# ---------------------------------------------------------------------------
# worktree-teardown.sh — live-lock forced past
# ---------------------------------------------------------------------------

@test "Given a live-PID lock in the worktree, when teardown runs with --force, then it exits 0, reports FORCED, and removes the lock" {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s %s\n' "$$" "$ts" > "${WT}/.forge-mutation.lock"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$REPO" "$WT" --force
  [ "$status" -eq 0 ]
  [[ "$output" == *"FORCED past live mutation run"* ]]
  [ ! -f "${WT}/.forge-mutation.lock" ]
}

# ---------------------------------------------------------------------------
# worktree-teardown.sh — stale-lock auto-cleared
# ---------------------------------------------------------------------------

@test "Given a stale-PID lock in the worktree, when teardown runs, then it reports stale lock auto-cleared and removes the worktree" {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # PID 999999 is unused by convention on macOS and Linux (max is typically lower)
  printf '%s %s\n' "999999" "$ts" > "${WT}/.forge-mutation.lock"

  run bash "${SCRIPTS_DIR}/worktree-teardown.sh" "$REPO" "$WT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"stale lock"* ]]
  [[ "$output" == *"auto-cleared"* ]]
  [ ! -d "$WT" ]
}
