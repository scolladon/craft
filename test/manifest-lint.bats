#!/usr/bin/env bats

load helpers/manifest-lint

FIXTURES="${BATS_TEST_DIRNAME}/fixtures/manifest"

# ---------------------------------------------------------------------------
# Absent / empty-frontmatter cases
# ---------------------------------------------------------------------------

@test "Given a non-existent manifest path, when lint runs, then it exits 0 and reports no manifest" {
  run_lint "${FIXTURES}/does-not-exist.workflow.md"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no manifest"* ]]
}

@test "Given a manifest file with no YAML frontmatter, when lint runs, then it exits 0 and reports pure defaults" {
  run_lint "${FIXTURES}/no-frontmatter.workflow.md"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no YAML frontmatter"* ]]
}

# ---------------------------------------------------------------------------
# Valid manifests
# ---------------------------------------------------------------------------

@test "Given a valid basic manifest, when lint runs, then it exits 0 and reports valid" {
  run_lint "${FIXTURES}/valid-basic.workflow.md"
  [ "$status" -eq 0 ]
  [[ "$output" == *"valid."* ]]
}

@test "Given comma-bearing inline arrays routed through file-ref validation, when lint runs, then it exits 0 (comma-protection regression)" {
  run_lint "${FIXTURES}/valid-inline-array.workflow.md"
  [ "$status" -eq 0 ]
  [[ "$output" == *"valid."* ]]
}

@test "Given a phase-context path with a trailing comment and quoted colon values, when lint runs, then it exits 0 (comment-strip/quoting regression)" {
  run_lint "${FIXTURES}/valid-quoting.workflow.md"
  [ "$status" -eq 0 ]
  [[ "$output" == *"valid."* ]]
}

# ---------------------------------------------------------------------------
# Invalid manifests
# ---------------------------------------------------------------------------

@test "Given a manifest with an unknown top-level key, when lint runs, then it exits 2 and reports unknown top-level key" {
  run_lint "${FIXTURES}/invalid-unknown-top-key.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"unknown top-level key"* ]]
}

@test "Given a manifest with an unknown phase name, when lint runs, then it exits 2 and reports unknown phase" {
  run_lint "${FIXTURES}/invalid-unknown-phase.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"unknown phase"* ]]
}

@test "Given a manifest with skip on a protected phase, when lint runs, then it exits 2 and reports skip refused" {
  run_lint "${FIXTURES}/invalid-skip-protected.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"skip: is refused on protected phase"* ]]
}

@test "Given a manifest referencing a missing file, when lint runs, then it exits 2 and reports missing file" {
  run_lint "${FIXTURES}/invalid-dangling-file.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"references missing file"* ]]
}
