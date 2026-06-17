#!/bin/bash
# craft — merge-phase cleanup. REFUSES while a mutation run-lock is alive.
#
# Lock protocol: the mutation phase writes <root>/.craft-mutation.lock containing
# "<pid> <iso-timestamp>" when it backgrounds a run, and removes it when the run lands.
# Teardown auto-clears a dead-PID lock; a live PID requires an explicit --force, whose
# use is echoed (pipeline mode records it in the run record).
#
# Usage: worktree-teardown.sh <main-repo-dir> <worktree-path> [--pre-teardown <script>] [--force]
set -euo pipefail

MAIN="${1:?usage: worktree-teardown.sh <main-repo-dir> <worktree-path> [--pre-teardown <script>] [--force]}"
WT="${2:?missing worktree path}"
shift 2
PRE=""
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --pre-teardown) PRE="${2:?--pre-teardown needs a script}"; shift 2 ;;
    --force)        FORCE=1; shift ;;
    *) echo "craft-teardown: unknown arg $1" >&2; exit 2 ;;
  esac
done

LOCK="$WT/.craft-mutation.lock"
if [ -f "$LOCK" ]; then
  read -r PID TS < "$LOCK" || true
  if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then
    if [ "$FORCE" -eq 1 ]; then
      echo "craft-teardown: FORCED past live mutation run (pid=$PID since $TS) — run destroyed."
      rm -f "$LOCK"
    else
      echo "craft-teardown: REFUSED — mutation run alive (pid=$PID since $TS). Wait for it or pass --force." >&2
      exit 3
    fi
  else
    echo "craft-teardown: stale lock (pid=${PID:-?} dead) auto-cleared."
    rm -f "$LOCK"
  fi
fi

BRANCH=$(git -C "$WT" rev-parse --abbrev-ref HEAD)

if [ -n "$PRE" ]; then
  if [ -x "$PRE" ]; then "$PRE" "$WT"; else bash "$PRE" "$WT"; fi
  echo "craft-teardown: pre-teardown script ran: $PRE"
fi

git -C "$MAIN" fetch --prune
if [ "$WT" != "$MAIN" ]; then
  git -C "$MAIN" worktree remove "$WT" --force
  echo "craft-teardown: worktree removed: $WT"
fi
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  git -C "$MAIN" branch -D "$BRANCH"
  echo "craft-teardown: local branch deleted: $BRANCH"
fi
