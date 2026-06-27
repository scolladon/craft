#!/usr/bin/env bats

ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"

FIXTURE="${BATS_TEST_DIRNAME}/fixtures/manifest/valid-pipeline-insert-infer-archetype.workflow.md"

@test "Given a flat insert entry with gate and no produces, when pipeline-resolve runs, then exits 0 and stdout carries ok:true, inferred-harness tail, smoke, and harness" {
  run node "${ROOT}/engine/bin/pipeline-resolve.js" "${ROOT}/pipeline/default.yml" "${FIXTURE}"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"ok": true'* ]]
  [[ "$output" == *'(inferred: gate with no produces)'* ]]
  [[ "$output" == *'smoke'* ]]
  [[ "$output" == *'harness'* ]]
}
