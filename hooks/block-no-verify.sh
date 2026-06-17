#!/bin/bash
# craft — PreToolUse(Bash): never bypass commit/push hooks. The gates are the workflow.
set -euo pipefail

IN=$(cat)
CMD=$(printf '%s' "$IN" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

if printf '%s' "$CMD" | grep -qE '\bgit\b.*(--no-verify\b|-n\b.*\bpush\b)' \
   && printf '%s' "$CMD" | grep -qE '\bgit\b[^;&|]*\b(commit|push|merge)\b[^;&|]*--no-verify\b'; then
  jq -cn '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"craft: --no-verify is banned — hooks are part of the gate. Fix what the hook reports instead of bypassing it."}}'
  exit 0
fi
exit 0
