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

# Run manifest-lint.sh with yq hidden from PATH so the subset-parser fallback
# is exercised. Asserts that the fallback and the yq paths agree on every
# fixture (the anti-regression property).
# Usage: run_lint_no_yq <fixture-path>
run_lint_no_yq() {
  local _yq_dir
  _yq_dir=$(dirname "$(command -v yq)")
  local _safe_path
  _safe_path=$(printf '%s' "$PATH" | tr ':' '\n' | grep -v "^${_yq_dir}$" | tr '\n' ':' | sed 's/:$//')
  run env PATH="${_safe_path}" bash "${BATS_TEST_DIRNAME}/../scripts/manifest-lint.sh" "$1"
}
