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
  local _yq_bin _yq_dir _safe_path seg
  _yq_bin=$(command -v yq 2>/dev/null || true)
  if [ -z "$_yq_bin" ]; then
    # yq absent: the subset-parser fallback is already the only path.
    run bash "${BATS_TEST_DIRNAME}/../scripts/manifest-lint.sh" "$1"
    return
  fi
  _yq_dir=$(dirname "$_yq_bin")
  _safe_path=""
  while IFS= read -r seg; do
    [ "$seg" = "$_yq_dir" ] && continue   # exact-match strip (no regex metachars)
    _safe_path="${_safe_path:+$_safe_path:}$seg"
  done < <(printf '%s' "$PATH" | tr ':' '\n')
  # Guard: if yq survives the strip (a second install), the equivalence claim is
  # vacuous — fail loudly rather than silently re-test the yq path.
  if env PATH="$_safe_path" command -v yq >/dev/null 2>&1; then
    skip "yq still resolvable after PATH strip — fallback equivalence untestable"
  fi
  run env PATH="$_safe_path" bash "${BATS_TEST_DIRNAME}/../scripts/manifest-lint.sh" "$1"
}
