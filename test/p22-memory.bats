#!/usr/bin/env bats

ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"

@test "Given .gitignore controls store committability, when craft-memory.md re-include line is checked, then it is present" {
  grep -qx '!.claude/craft-memory.md' "${ROOT}/.gitignore"
}

@test "Given .gitignore controls metrics committability, when craft-metrics.md re-include line is checked, then it is present" {
  grep -qx '!.claude/craft-metrics.md' "${ROOT}/.gitignore"
}

@test "Given .gitignore uses dir re-include for file re-includes to take effect, when .claude/ dir re-include line is checked, then it is present" {
  grep -qx '!.claude/' "${ROOT}/.gitignore"
}

@test "Given the memory port doc was authored in S4, when its path is checked, then it exists" {
  [ -f "${ROOT}/docs/adapters/memory.md" ]
}

@test "Given source and tests must carry no provenance refs, when engine/src/memory.js and engine/test/memory.test.js are checked, then no P22 or ADR tokens appear" {
  ! grep -rE 'P22|ADR-[0-9]' "${ROOT}/engine/src/memory.js" "${ROOT}/engine/test/memory.test.js"
}
