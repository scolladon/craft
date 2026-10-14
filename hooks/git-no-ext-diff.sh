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
# is not JSON, a feed that cannot start, a grep that neither matches nor cleanly misses,
# a clean exit with no verdict) ends in exit 2 with a `craft git-no-ext-diff:` reason on stderr, never in the
# status that crashed. The matcher's own verdict stays the JSON deny on stdout.
# TERM and HUP deny the same way. Still fails open, because no code here runs to catch it:
# /bin/bash missing, this file missing or not executable, SIGKILL or any other untrapped
# signal. A run past Claude Code's hook timeout (600 s; hooks.json sets none) fails open
# too, though code here does run: at the deadline Claude Code sends SIGTERM to this hook's
# whole process tree, so a stalled cat, jq, grep or sed dies with it (whatever survives is
# SIGKILLed), then runs the call whatever this hook exits with or prints (2.1.296 with the
# hook in a background wait, 2.1.299 stalled in a foreground command). The TERM and HUP
# traps still deny either signal from any other sender.
set -euo pipefail

readonly CRASH_DENY_EXIT_CODE=2
readonly GREP_NO_MATCH=1
readonly NO_MATCHING_LINES=0
readonly FEED_SENTINEL='.'
readonly FEED_NEVER_RAN_STATUS=1
readonly SIGTERM_EXIT_STATUS=143
readonly SIGHUP_EXIT_STATUS=129

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

# A command substitution that cannot start (no pipe or fork left) expands to nothing with
# status 0, which reads as an empty command. Only a feed that ran to the end appends the
# sentinel, so a missing one is a crash.
IN=$(cat && printf '%s' "$FEED_SENTINEL")
[ "${IN%"$FEED_SENTINEL"}" != "$IN" ] || exit "$FEED_NEVER_RAN_STATUS"
IN=${IN%"$FEED_SENTINEL"}
CMD=$(printf '%s' "$IN" | jq -r '.tool_input.command // empty' && printf '%s' "$FEED_SENTINEL")
[ "${CMD%"$FEED_SENTINEL"}" != "$CMD" ] || exit "$FEED_NEVER_RAN_STATUS"
CMD=${CMD%"$FEED_SENTINEL"}
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
# `grep -c` reads to EOF, so the writer never meets a closed pipe, and needs no temp file the
# way a here-string does. Only a no-match status WITH a printed zero count allows: a feed that
# failed before grep ran prints no count, so its status 1 is a crash, not a miss.
match_status=0
match_count=$(printf '%s' "$CMD" | grep -cE "$GIT_RE") || match_status=$?
if [ "$match_status" -eq "$GREP_NO_MATCH" ] && [ "$match_count" = "$NO_MATCHING_LINES" ]; then
  allow
fi
[ "$match_status" -eq 0 ] || exit "$match_status"

# Build the corrected command: insert --no-ext-diff after the first diff/show subcommand.
FIXED=$(printf '%s' "$CMD" | sed -E "s/(^|[;&|][[:space:]]*)(git([[:space:]]+(-C[[:space:]]+[^[:space:]]+|-c[[:space:]]+[^[:space:]]+|--git-dir=[^[:space:]]+|--work-tree=[^[:space:]]+))*[[:space:]]+(diff|show))([[:space:]]|$)/\1\2 --no-ext-diff\6/")

jq -cn --arg fixed "$FIXED" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("craft: scripted git diff/show must pass --no-ext-diff (external diff mangles parsed output). Re-issue exactly: " + $fixed)}}'
verdict_reached=1
