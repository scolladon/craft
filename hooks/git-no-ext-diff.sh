#!/bin/bash
# craft — PreToolUse(Bash): scripted `git diff` / `git show` must carry --no-ext-diff.
# External-diff tools (difftastic, …) mangle machine-parsed output; agents always parse.
#
# Strategy: DENY with a reason, never rewrite. Spike-pinned (2026-06-12): two `updatedInput`
# hooks on one event do NOT compose (same snapshot, last writer wins), so a rewrite here could
# be silently clobbered by another rewriting hook (e.g. rtk). A deny beats a concurrent rewrite
# deterministically — one corrected retry, no clobber.
#
# Verdict: the engine's ext-diff rule, computed by node (engine/bin/claude-ext-diff-verdict.js),
# which parses the shell text: wrappers, assignments, subshells, quotes, `sh -c`, git globals.
# Node reads the payload on the inherited stdin and prints exactly one token: `allow`, or the
# JSON deny carrying the engine reason, which this file prints as given.
#
# Crash path: Claude Code (2.1.296) runs the Bash call on every hook exit status except 2,
# and the model never sees the crash. So every failure below (node missing from PATH, older
# than the engine's supported range, crashed, signalled, or exiting 0 without a verdict token;
# stdin that is not JSON; a feed that cannot start) ends in exit 2 with a
# `craft git-no-ext-diff:` reason on stderr, never in the status that crashed.
# TERM and HUP deny the same way. Still fails open, because no code here runs to catch it:
# /bin/bash missing, this file missing or not executable, SIGKILL or any other untrapped
# signal. A run past Claude Code's hook timeout (600 s; hooks.json sets none) fails open
# too, though code here does run: at the deadline Claude Code (2.1.299) sends SIGTERM to
# this hook's whole process tree, so a stalled node dies with it (whatever survives is
# SIGKILLed), then runs the call whatever this hook exits with or prints (2.1.296 in a
# background wait, 2.1.299 in a foreground stall). The TERM and HUP traps still deny either
# signal from any other sender.
set -euo pipefail

readonly CRASH_DENY_EXIT_CODE=2
readonly FEED_SENTINEL='.'
readonly FEED_NEVER_RAN_STATUS=1
readonly SIGTERM_EXIT_STATUS=143
readonly SIGHUP_EXIT_STATUS=129
# deny_on_crash reports an exit 0 before a verdict as "no verdict reached"
readonly NO_VERDICT_STATUS=0
readonly ALLOW_VERDICT='allow'
readonly DENY_VERDICT_PREFIX='{"hookSpecificOutput":'
readonly DENY_VERDICT_SUFFIX='"}}'

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
# A signal's default action ends bash with the signal's status even after the EXIT trap ran;
# exiting from the signal's own trap hands the EXIT trap that status to deny instead.
trap 'exit "$SIGTERM_EXIT_STATUS"' TERM
trap 'exit "$SIGHUP_EXIT_STATUS"' HUP

# The verdict bin sits beside the real hook, so a symlinked hook is followed to its target first.
# A bare name gets a ./ so its directory is always the part before the last slash.
hook_path=${BASH_SOURCE[0]}
case "$hook_path" in
  */*) ;;
  *)   hook_path=./$hook_path ;;
esac
while [ -L "$hook_path" ]; do
  link=$(readlink "$hook_path")
  case "$link" in
    /*) hook_path=$link ;;
    *)  hook_path=${hook_path%/*}/$link ;;
  esac
done
readonly VERDICT_BIN="${hook_path%/*}/../engine/bin/claude-ext-diff-verdict.js"

# A command substitution that cannot start (no pipe or fork left) expands to nothing with
# status 0, which reads as a silent verdict. Only a node run that exited 0 appends the
# sentinel, so a missing one is a crash; a node that failed ends the hook through errexit
# with its own status, which the EXIT trap denies.
VERDICT=$(node "$VERDICT_BIN" && printf '%s' "$FEED_SENTINEL")
[ "${VERDICT%"$FEED_SENTINEL"}" != "$VERDICT" ] || exit "$FEED_NEVER_RAN_STATUS"
VERDICT=${VERDICT%"$FEED_SENTINEL"}
case "$VERDICT" in
  "$ALLOW_VERDICT")        allow ;;
  "$DENY_VERDICT_PREFIX"*"$DENY_VERDICT_SUFFIX") printf '%s\n' "$VERDICT" ;;
  *)                       exit "$NO_VERDICT_STATUS" ;;
esac
verdict_reached=1
