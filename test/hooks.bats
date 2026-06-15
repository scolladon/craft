#!/usr/bin/env bats

load helpers/hooks

# ---------------------------------------------------------------------------
# block-no-verify.sh — deny matrix
# ---------------------------------------------------------------------------

@test "Given git commit with --no-verify flag, when block-no-verify runs, then it denies" {
  run decision block-no-verify.sh block-no-verify-commit.json
  [ "$status" -eq 0 ]
  [ "$output" = "deny" ]
}

@test "Given git push with --no-verify flag, when block-no-verify runs, then it denies" {
  run decision block-no-verify.sh block-no-verify-push.json
  [ "$status" -eq 0 ]
  [ "$output" = "deny" ]
}

@test "Given git merge with --no-verify flag, when block-no-verify runs, then it denies" {
  run decision block-no-verify.sh block-no-verify-merge.json
  [ "$status" -eq 0 ]
  [ "$output" = "deny" ]
}

@test "Given a denied bypass, when block-no-verify runs, then the reason explains the ban" {
  run reason block-no-verify.sh block-no-verify-commit.json
  [ "$status" -eq 0 ]
  [[ "$output" == *"hooks are part of the gate"* ]]
}

# ---------------------------------------------------------------------------
# block-no-verify.sh — allow matrix
# ---------------------------------------------------------------------------

@test "Given git commit without --no-verify flag, when block-no-verify runs, then it allows (empty output)" {
  run decision block-no-verify.sh block-no-verify-allow-commit.json
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

@test "Given non-git command npm test, when block-no-verify runs, then it allows (empty output)" {
  run decision block-no-verify.sh block-no-verify-allow-npm.json
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

# ---------------------------------------------------------------------------
# git-no-ext-diff.sh — deny matrix
# ---------------------------------------------------------------------------

@test "Given git diff HEAD~1 without --no-ext-diff, when git-no-ext-diff runs, then it denies" {
  run decision git-no-ext-diff.sh no-ext-diff-deny-diff.json
  [ "$status" -eq 0 ]
  [ "$output" = "deny" ]
}

@test "Given git diff HEAD~1 without --no-ext-diff, when git-no-ext-diff runs, then reason contains corrected command" {
  run reason git-no-ext-diff.sh no-ext-diff-deny-diff.json
  [ "$status" -eq 0 ]
  [[ "$output" == *"git diff --no-ext-diff HEAD~1"* ]]
}

@test "Given git -C /x show abc without --no-ext-diff, when git-no-ext-diff runs, then it denies" {
  run decision git-no-ext-diff.sh no-ext-diff-deny-global-opts.json
  [ "$status" -eq 0 ]
  [ "$output" = "deny" ]
}

@test "Given git -C /x show abc without --no-ext-diff, when git-no-ext-diff runs, then reason contains corrected command" {
  run reason git-no-ext-diff.sh no-ext-diff-deny-global-opts.json
  [ "$status" -eq 0 ]
  [[ "$output" == *"git -C /x show --no-ext-diff abc"* ]]
}

@test "Given git -c <k=v> diff without --no-ext-diff, when git-no-ext-diff runs, then it denies" {
  run decision git-no-ext-diff.sh no-ext-diff-deny-c-opt.json
  [ "$status" -eq 0 ]
  [ "$output" = "deny" ]
}

@test "Given git -c <k=v> diff without --no-ext-diff, when git-no-ext-diff runs, then reason contains corrected command" {
  run reason git-no-ext-diff.sh no-ext-diff-deny-c-opt.json
  [ "$status" -eq 0 ]
  [[ "$output" == *"git -c core.pager=cat diff --no-ext-diff HEAD"* ]]
}

@test "Given git --git-dir=... diff without --no-ext-diff, when git-no-ext-diff runs, then it denies" {
  run decision git-no-ext-diff.sh no-ext-diff-deny-gitdir.json
  [ "$status" -eq 0 ]
  [ "$output" = "deny" ]
}

@test "Given git --work-tree=... diff without --no-ext-diff, when git-no-ext-diff runs, then it denies" {
  run decision git-no-ext-diff.sh no-ext-diff-deny-worktree.json
  [ "$status" -eq 0 ]
  [ "$output" = "deny" ]
}

# ---------------------------------------------------------------------------
# git-no-ext-diff.sh — allow matrix
# ---------------------------------------------------------------------------

@test "Given git diff --no-ext-diff x (already compliant), when git-no-ext-diff runs, then it allows (empty output)" {
  run decision git-no-ext-diff.sh no-ext-diff-allow-compliant.json
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

@test "Given git stash show, when git-no-ext-diff runs, then it allows (empty output)" {
  run decision git-no-ext-diff.sh no-ext-diff-allow-stash.json
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

@test "Given git show-ref, when git-no-ext-diff runs, then it allows (empty output)" {
  run decision git-no-ext-diff.sh no-ext-diff-allow-showref.json
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

@test "Given git difftool, when git-no-ext-diff runs, then it allows (empty output)" {
  run decision git-no-ext-diff.sh no-ext-diff-allow-difftool.json
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

@test "Given rtk proxy git diff, when git-no-ext-diff runs, then it allows (empty output)" {
  run decision git-no-ext-diff.sh no-ext-diff-allow-rtk.json
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}
