#!/bin/bash
# craft — merge-phase cleanup. REFUSES while a validation run-lock is alive.
#
# Lock protocol: the validation phase writes <root>/.craft-validation.lock containing
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

LOCK="$WT/.craft-validation.lock"
if [ -f "$LOCK" ]; then
  read -r PID TS < "$LOCK" || true
  # Numeric guard before kill -0: a non-numeric or negative PID (e.g. "-1", which
  # signals a whole process group) must be treated as a dead/invalid lock, never live.
  if [ -n "${PID:-}" ] && [[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null; then
    if [ "$FORCE" -eq 1 ]; then
      echo "craft-teardown: FORCED past live validation run (pid=$PID since $TS) — run destroyed."
      rm -f "$LOCK"
    else
      echo "craft-teardown: REFUSED — validation run alive (pid=$PID since $TS). Wait for it or pass --force." >&2
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

# Only prune against a remote that exists — a local-only repo has none, and on some
# git versions `fetch --prune` then aborts the script under `set -e` (P11 dogfood).
if [ -n "$(git -C "$MAIN" remote)" ]; then
  git -C "$MAIN" fetch --prune
fi

# realpath both sides so the guard holds when WT and MAIN are the same checkout
# spelled differently (trailing slash, symlink, "."), never removing the main repo.
MAIN_REAL="$(realpath "$MAIN")"
WT_REAL="$(realpath "$WT")"
if [ "$WT_REAL" != "$MAIN_REAL" ]; then
  git -C "$MAIN" worktree remove "$WT" --force
  echo "craft-teardown: worktree removed: $WT"
fi
if [ "$BRANCH" != "main" ] && [ "$BRANCH" != "master" ]; then
  git -C "$MAIN" branch -D -- "$BRANCH"
  echo "craft-teardown: local branch deleted: $BRANCH"
fi
