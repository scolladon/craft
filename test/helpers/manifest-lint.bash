#!/usr/bin/env bash
# Bats helper: shared utilities for manifest-lint tests.

# Run manifest-lint.sh against a fixture path, capturing status and output.
# The script writes INVALID-manifest diagnostics to stderr; bats merges stderr
# into $output by default (no --separate-stderr), so invalid-case assertions on
# $output are intentional and depend on that merge.
# Usage: run_lint <fixture-path>
run_lint() {
  run bash "${BATS_TEST_DIRNAME}/../scripts/manifest-lint.sh" "$1"
}
