#!/usr/bin/env bash
# Bats helper: shared utilities for worktree-setup / worktree-teardown tests.

SCRIPTS_DIR="${BATS_TEST_DIRNAME}/../scripts"

# mk_worktree <repo-dir> <worktree-dir> <branch-name>
#
# Initialises a throwaway bare-minimum git repo at <repo-dir>, adds a remote
# that points back to itself (so "git fetch --prune" resolves without network
# access), and creates a worktree at <worktree-dir> on <branch-name>.
# Caller is responsible for removing both directories in teardown().
mk_worktree() {
  local repo_dir="$1"
  local wt_dir="$2"
  local branch="$3"

  git init -q "$repo_dir"
  git -C "$repo_dir" config user.email "test@forge"
  git -C "$repo_dir" config user.name  "forge-test"
  git -C "$repo_dir" commit --allow-empty -q -m "init"

  # A remote pointing to itself lets "git fetch --prune" succeed without a
  # real network connection, which worktree-teardown.sh invokes unconditionally.
  git -C "$repo_dir" remote add origin "$repo_dir"

  git -C "$repo_dir" worktree add -q --orphan "$wt_dir" -b "$branch"
  git -C "$wt_dir"   commit --allow-empty -q -m "wt-init"
}
