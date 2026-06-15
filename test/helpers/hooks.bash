#!/usr/bin/env bash
# Bats helper: shared utilities for PreToolUse hook tests.

HOOKS_DIR="${BATS_TEST_DIRNAME}/../hooks"
HOOK_FIXTURES="${BATS_TEST_DIRNAME}/fixtures/hooks"

# decision <hook-name> <fixture-filename>
#
# Pipes the named JSON fixture through the named hook and echoes the parsed
# permissionDecision value ("deny" or empty string when the hook emits no output).
decision() {
  local hook="$1" fixture="$2" raw
  raw=$(printf '%s' "$(cat "${HOOK_FIXTURES}/${fixture}")" \
    | bash "${HOOKS_DIR}/${hook}")
  if [ -z "$raw" ]; then
    echo ""
  else
    printf '%s' "$raw" | jq -r '.hookSpecificOutput.permissionDecision'
  fi
}

# reason <hook-name> <fixture-filename>
#
# Pipes the named JSON fixture through the named hook and echoes the parsed
# permissionDecisionReason string (empty when the hook emits no output).
reason() {
  local hook="$1" fixture="$2" raw
  raw=$(printf '%s' "$(cat "${HOOK_FIXTURES}/${fixture}")" \
    | bash "${HOOKS_DIR}/${hook}")
  if [ -z "$raw" ]; then
    echo ""
  else
    printf '%s' "$raw" | jq -r '.hookSpecificOutput.permissionDecisionReason'
  fi
}
