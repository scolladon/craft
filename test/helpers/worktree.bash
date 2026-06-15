#!/usr/bin/env bash
# Bats helper: shared utilities for worktree-setup / worktree-teardown tests.

# mk_worktree <repo-dir> <worktree-dir> <branch-name>
#
# Initialises a throwaway git repo at <repo-dir> with an initial commit, points
# an `origin` remote back at itself, and creates a worktree at <worktree-dir> on
# <branch-name>. The self-pointing remote mirrors a real forge repo (teardown's
# `git fetch --prune` runs against a repo that has an origin) and keeps that
# fetch deterministic across git versions. Caller removes both dirs in teardown.
mk_worktree() {
  local repo_dir="$1"
  local wt_dir="$2"
  local branch="$3"

  git init -q "$repo_dir"
  git -C "$repo_dir" config user.email "test@forge"
  git -C "$repo_dir" config user.name  "forge-test"
  git -C "$repo_dir" commit --allow-empty -q -m "init"
  git -C "$repo_dir" remote add origin "$repo_dir"

  git -C "$repo_dir" worktree add -q --orphan "$wt_dir" -b "$branch"
  git -C "$wt_dir"   commit --allow-empty -q -m "wt-init"
}
