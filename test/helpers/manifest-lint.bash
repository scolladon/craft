#!/usr/bin/env bash
# Bats helper: shared utilities for manifest-lint tests.

# Run manifest-lint.sh against a fixture path, capturing status and output.
# Usage: run_lint <fixture-path>
run_lint() {
  run bash "${BATS_TEST_DIRNAME}/../scripts/manifest-lint.sh" "$1"
}
