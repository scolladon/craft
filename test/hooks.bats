#!/usr/bin/env bats

load helpers/hooks

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
