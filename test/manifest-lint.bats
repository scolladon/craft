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

@test "Given a manifest with a per-phase skip field, when lint runs, then it exits 2 with legacy-skip guidance" {
  run_lint "${FIXTURES}/invalid-skip-protected.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"pipeline.skip"* ]]
}

@test "Given a manifest with pipeline.skip top-level key, when lint runs, then it exits 0 and reports valid" {
  run_lint "${FIXTURES}/valid-pipeline-skip.workflow.md"
  [ "$status" -eq 0 ]
  [[ "$output" == *"valid."* ]]
}

@test "Given a manifest referencing a missing file, when lint runs, then it exits 2 and reports missing file" {
  run_lint "${FIXTURES}/invalid-dangling-file.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"references missing file"* ]]
}

@test "Given an inline-map gates with an unknown field, when lint runs, then it exits 2 and reports unknown gates field" {
  run_lint "${FIXTURES}/invalid-unknown-gates-field.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"unknown gates field"* ]]
}

# ---------------------------------------------------------------------------
# Fold-introduced code paths (ADR-010/011/012) — pinned end-to-end through the CLI
# ---------------------------------------------------------------------------

@test "Given malformed YAML frontmatter, when lint runs, then it exits 2 with an INVALID manifest message (no crash)" {
  run_lint "${FIXTURES}/invalid-malformed-yaml.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"malformed YAML"* ]]
}

@test "Given an unknown pipeline sub-key, when lint runs, then it exits 2 and reports unknown pipeline key" {
  run_lint "${FIXTURES}/invalid-unknown-pipeline-key.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"unknown pipeline key"* ]]
}

@test "Given a per-phase skip on a non-protected phase, when lint runs, then it exits 2 with legacy-skip guidance (ADR-011 broadening)" {
  run_lint "${FIXTURES}/invalid-skip-nonprotected.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"pipeline.skip"* ]]
}

@test "Given a directory path as the manifest argument, when lint runs, then it exits 0 and reports no manifest (faithful to [ -f ])" {
  run_lint "${FIXTURES}"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no manifest"* ]]
}

# ---------------------------------------------------------------------------
# Canonical phase names + renamed models key
# ---------------------------------------------------------------------------

@test "Given a manifest with new canonical phase names and validation-triager model key, when lint runs, then it exits 0 and reports valid" {
  run_lint "${FIXTURES}/valid-new-phase-names.workflow.md"
  [ "$status" -eq 0 ]
  [[ "$output" == *"valid."* ]]
}

@test "Given a manifest with the renamed mutation-triager models key, when lint runs, then it exits 2 and reports INVALID manifest with validation-triager guidance" {
  run_lint "${FIXTURES}/invalid-renamed-agent-model.workflow.md"
  [ "$status" -eq 2 ]
  [[ "$output" == *"INVALID manifest"* ]]
  [[ "$output" == *"mutation-triager"* ]]
  [[ "$output" == *"validation-triager"* ]]
}
