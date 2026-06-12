#!/bin/bash
# forge — PreToolUse(Bash): scripted `git diff` / `git show` must carry --no-ext-diff.
# External-diff tools (difftastic, …) mangle machine-parsed output; agents always parse.
#
# Strategy: DENY with the exact corrected command. Spike-pinned (2026-06-12): two
# `updatedInput` hooks on one event do NOT compose (same snapshot, last writer wins),
# so a rewrite here could be silently clobbered by another rewriting hook (e.g. rtk).
# A deny beats a concurrent rewrite deterministically — one corrected retry, no clobber.
set -euo pipefail

IN=$(cat)
CMD=$(printf '%s' "$IN" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

# Already compliant, or explicitly proxied raw — let it through.
case "$CMD" in
  *--no-ext-diff*) exit 0 ;;
  *"rtk proxy"*)   exit 0 ;;
esac

# Match a git invocation whose SUBCOMMAND is diff or show, allowing global options
# (-C <path>, -c <k=v>, --git-dir=…, --work-tree=…) between `git` and the subcommand.
# Deliberately does not match `git stash show`, `git show-ref`, `git difftool`.
GIT_RE='(^|[;&|]\s*)git(\s+(-C\s+\S+|-c\s+\S+|--git-dir=\S+|--work-tree=\S+))*\s+(diff|show)(\s|$)'
if ! printf '%s' "$CMD" | grep -qE "$GIT_RE"; then
  exit 0
fi

# Build the corrected command: insert --no-ext-diff after the first diff/show subcommand.
FIXED=$(printf '%s' "$CMD" | sed -E "s/(^|[;&|][[:space:]]*)(git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--git-dir=[^[:space:]]+|--work-tree=[^[:space:]]+))*[[:space:]]+(diff|show))([[:space:]]|$)/\1\2 --no-ext-diff\6/")

jq -cn --arg fixed "$FIXED" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("forge: scripted git diff/show must pass --no-ext-diff (external diff mangles parsed output). Re-issue exactly: " + $fixed)}}'
