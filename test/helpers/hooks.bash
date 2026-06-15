#!/usr/bin/env bash
# Bats helper: shared utilities for PreToolUse hook tests.

HOOKS_DIR="${BATS_TEST_DIRNAME}/../hooks"
HOOK_FIXTURES="${BATS_TEST_DIRNAME}/fixtures/hooks"

# _run_hook <hook-name> <fixture-filename>
#
# Feeds the fixture JSON to the hook on stdin and forwards the hook's stdout.
# The exit code is the hook's own, so callers (and bats $status) observe a hook
# failure instead of masking it as a silent "allow".
_run_hook() {
  bash "${HOOKS_DIR}/$1" < "${HOOK_FIXTURES}/$2"
}

# decision <hook-name> <fixture-filename>
#
# Echoes the parsed permissionDecision ("deny", or empty when the hook is
# silent). Propagates a non-zero hook exit instead of reporting "allow".
decision() {
  local raw rc
  raw=$(_run_hook "$1" "$2"); rc=$?
  [ "$rc" -ne 0 ] && return "$rc"
  [ -z "$raw" ] && return 0
  printf '%s' "$raw" | jq -r '.hookSpecificOutput.permissionDecision'
}

# reason <hook-name> <fixture-filename>
#
# Echoes the parsed permissionDecisionReason (empty when the hook is silent).
# Propagates a non-zero hook exit instead of reporting an empty reason.
reason() {
  local raw rc
  raw=$(_run_hook "$1" "$2"); rc=$?
  [ "$rc" -ne 0 ] && return "$rc"
  [ -z "$raw" ] && return 0
  printf '%s' "$raw" | jq -r '.hookSpecificOutput.permissionDecisionReason'
}
