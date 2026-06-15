#!/usr/bin/env bats

@test "Given bats on PATH, when a trivial command runs, then it exits 0" {
  run true
  [ "$status" -eq 0 ]
}
