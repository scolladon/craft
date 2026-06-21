#!/usr/bin/env bash
# Substrate gate — the single shared definition that CI and local both run.
# Slices that add new binaries append to this file so CI never references a
# binary before it exists.
set -euo pipefail

# Resolve from repo root so relative paths and globs are call-site independent.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

EXPECTED_TESTS=699

node_output="$(cd engine && node --test 'test/**/*.test.js' 2>&1)" && node_status=0 || node_status=$?
echo "$node_output"
[ "$node_status" -eq 0 ] || {
  echo "ci: node --test failed (exit ${node_status})" >&2
  exit "$node_status"
}
actual_tests="$(printf '%s\n' "$node_output" | awk '/^# tests / {print $3}')"
[ "$actual_tests" = "$EXPECTED_TESTS" ] || {
  echo "ci: test count drift — expected ${EXPECTED_TESTS}, got ${actual_tests}" >&2
  exit 1
}

EXPECTED_PI_TESTS=202

pi_output="$(cd adapters/pi && node --test 'test/**/*.test.js' 2>&1)" && pi_status=0 || pi_status=$?
echo "$pi_output"
[ "$pi_status" -eq 0 ] || { echo "ci: adapters/pi node --test failed (exit ${pi_status})" >&2; exit "$pi_status"; }
actual_pi_tests="$(printf '%s\n' "$pi_output" | awk '/^# tests / {print $3}')"
[ "$actual_pi_tests" = "$EXPECTED_PI_TESTS" ] || { echo "ci: pi test count drift — expected ${EXPECTED_PI_TESTS}, got ${actual_pi_tests}" >&2; exit 1; }

bats test/ && shellcheck scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js pipeline/default.yml && node engine/bin/pipeline-resolve.js pipeline/default.yml && node engine/bin/contracts-lint.js contracts
