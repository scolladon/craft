#!/usr/bin/env bats

# P12 anti-rot gate: every shipped example manifest must pass manifest-lint, so the injection
# catalog (docs/GUIDE-customizing.md) never advertises a sample that no longer resolves (ADR-063).
# Examples reference their sample context/override bodies under examples/.claude/workflow/, which
# resolve via the linter's ROOT = dirname(dirname(manifest)) rule (here ROOT = examples/).

load helpers/manifest-lint

EXAMPLES="${BATS_TEST_DIRNAME}/../examples"

@test "Given the examples directory, when listed, then at least one example manifest exists (the loop is non-vacuous)" {
  run bash -c "ls ${EXAMPLES}/*/workflow.md | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "Given every examples/*/workflow.md, when lint runs, then each exits 0 and reports valid" {
  for manifest in "${EXAMPLES}"/*/workflow.md; do
    run_lint "$manifest"
    [ "$status" -eq 0 ] || {
      echo "lint failed for ${manifest}:" >&2
      echo "$output" >&2
      false
    }
    [[ "$output" == *"valid."* ]]
  done
}
