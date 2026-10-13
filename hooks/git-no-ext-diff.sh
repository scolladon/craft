#!/bin/bash
# craft — PreToolUse(Bash): scripted `git diff` / `git show` must carry --no-ext-diff.
# External-diff tools (difftastic, …) mangle machine-parsed output; agents always parse.
#
# Strategy: DENY with the exact corrected command. Spike-pinned (2026-06-12): two
# `updatedInput` hooks on one event do NOT compose (same snapshot, last writer wins),
# so a rewrite here could be silently clobbered by another rewriting hook (e.g. rtk).
# A deny beats a concurrent rewrite deterministically — one corrected retry, no clobber.
#
# Crash path: Claude Code (2.1.296) runs the Bash call on every hook exit status except 2,
# and the model never sees the crash. So every failure below (a missing tool, stdin that
# is not JSON, a grep that neither matches nor cleanly misses, a clean exit with no
# verdict) ends in exit 2 with a `craft git-no-ext-diff:` reason on stderr, never in the
# status that crashed. The matcher's own verdict stays the JSON deny on stdout.
# Still fails open, because no code here runs to catch it: /bin/bash missing, this file
# missing or not executable, death by a signal, a kill by Claude Code's hook timeout.
set -euo pipefail

readonly CRASH_DENY_EXIT_CODE=2
readonly GREP_NO_MATCH=1

# bash 3.2 ends a syntax error below the trap with status 0, so only a reached verdict
# may exit clean.
verdict_reached=0

allow() {
  verdict_reached=1
  exit 0
}

deny_on_crash() {
  local rc="$1"
  [ "$rc" -eq 0 ] && [ "$verdict_reached" -eq 1 ] && return 0
  local cause="failed (exit $rc)"
  [ "$rc" -eq 0 ] && cause="no verdict reached"
  # errexit still applies here: a failed write must not abort the trap before the deny
  printf 'craft git-no-ext-diff: %s, call denied\n' "$cause" >&2 || true
  exit "$CRASH_DENY_EXIT_CODE"
}
trap 'deny_on_crash "$?"' EXIT

IN=$(cat)
CMD=$(printf '%s' "$IN" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && allow

# Already compliant, or explicitly proxied raw — let it through.
case "$CMD" in
  *--no-ext-diff*) allow ;;
  *"rtk proxy"*)   allow ;;
esac

# Match a git invocation whose SUBCOMMAND is diff or show, allowing global options
# (-C <path>, -c <k=v>, --git-dir=…, --work-tree=…) between `git` and the subcommand.
# Deliberately does not match `git stash show`, `git show-ref`, `git difftool`.
GIT_RE='(^|[;&|]\s*)git(\s+(-C\s+\S+|-c\s+\S+|--git-dir=\S+|--work-tree=\S+))*\s+(diff|show)(\s|$)'
# Here-string, not a pipe: with no writer process an early-exiting `grep -q` has nothing to
# break. Only grep's no-match status allows; any other status is a crash and denies.
match_status=0
grep -qE "$GIT_RE" <<<"$CMD" || match_status=$?
case "$match_status" in
  0) ;;
  "$GREP_NO_MATCH") allow ;;
  *) exit "$match_status" ;;
esac

# Build the corrected command: insert --no-ext-diff after the first diff/show subcommand.
FIXED=$(printf '%s' "$CMD" | sed -E "s/(^|[;&|][[:space:]]*)(git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--git-dir=[^[:space:]]+|--work-tree=[^[:space:]]+))*[[:space:]]+(diff|show))([[:space:]]|$)/\1\2 --no-ext-diff\6/")

jq -cn --arg fixed "$FIXED" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("craft: scripted git diff/show must pass --no-ext-diff (external diff mangles parsed output). Re-issue exactly: " + $fixed)}}'
verdict_reached=1
