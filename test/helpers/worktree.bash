#!/usr/bin/env bash
# Bats helper: shared utilities for worktree-setup / worktree-teardown tests.

# mk_worktree_no_remote <repo-dir> <worktree-dir> <branch-name>
#
# Initialises a throwaway git repo at <repo-dir> with an initial commit and a
# worktree at <worktree-dir> on <branch-name> — but adds NO remote. Mirrors a
# local-only repo (the case that surfaced teardown's `git fetch --prune` abort).
# Caller removes both dirs.
mk_worktree_no_remote() {
  local repo_dir="$1"
  local wt_dir="$2"
  local branch="$3"

  git init -q "$repo_dir"
  git -C "$repo_dir" config user.email "test@craft"
  git -C "$repo_dir" config user.name  "craft-test"
  git -C "$repo_dir" commit --allow-empty -q -m "init"

  git -C "$repo_dir" worktree add -q --orphan "$wt_dir" -b "$branch"
  git -C "$wt_dir"   commit --allow-empty -q -m "wt-init"
}

# mk_worktree <repo-dir> <worktree-dir> <branch-name>
#
# As mk_worktree_no_remote, plus an `origin` remote pointing back at the repo
# itself. The self-pointing remote mirrors a real craft repo (teardown's
# `git fetch --prune` runs against a repo that has an origin) and keeps that
# fetch deterministic across git versions. Caller removes both dirs in teardown.
mk_worktree() {
  local repo_dir="$1"
  local wt_dir="$2"
  local branch="$3"

  mk_worktree_no_remote "$repo_dir" "$wt_dir" "$branch"
  git -C "$repo_dir" remote add origin "$repo_dir"
}
