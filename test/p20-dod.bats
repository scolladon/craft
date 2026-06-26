#!/usr/bin/env bats

ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"

@test "Given docs/DOD.md is the repo DoD artifact, when its path is checked, then it exists" {
  [ -f "${ROOT}/docs/DOD.md" ]
}

@test "Given docs/DOD.md exists, when its size is checked, then it is non-empty" {
  [ -s "${ROOT}/docs/DOD.md" ]
}

@test "Given docs/DOD.md exists, when its content is checked, then it contains at least one checklist line" {
  grep -qE '^- \[[ xX]\] ' "${ROOT}/docs/DOD.md"
}

@test "Given docs/DOD.md exists, when its content is checked, then it includes a harness-techniques triaged-or-documented durable bar line" {
  grep -qiE 'harness techniques triaged|triaged-or-documented' "${ROOT}/docs/DOD.md"
}
