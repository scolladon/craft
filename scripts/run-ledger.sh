#!/usr/bin/env bash
# craft — the run ledger's one write and locate surface.
#
# Usage: run-ledger.sh open <run-id> [--in-place]
#        run-ledger.sh append <run-id> <phase>
#        run-ledger.sh move <run-id> <worktree>
#        run-ledger.sh locate --transcript <path>
#        run-ledger.sh locate --run <run-id>
#        run-ledger.sh close <run-id>
#        run-ledger.sh dir
set -euo pipefail
export LC_ALL=C

readonly LEDGER_HEADER='# craft run record (append-only)'
readonly RUNS_SUBDIR='.claude/craft-runs'
readonly RECORD_FILENAME='craft-run-record.md'
readonly POINTER_SUFFIX='.pointer'
readonly SCRATCH_SUFFIX='.pre.md'
readonly DELTA_SUFFIX='.delta.json'
readonly RUN_ID_PATTERN='^[a-z0-9][a-z0-9-]*$'
readonly PHASE_PATTERN='^[a-z][a-z0-9-]*$'

usage_exit() {
  cat >&2 <<'EOF'
usage: run-ledger.sh open <run-id> [--in-place]
       run-ledger.sh append <run-id> <phase>
       run-ledger.sh move <run-id> <worktree>
       run-ledger.sh locate --transcript <path> | --run <run-id>
       run-ledger.sh close <run-id>
       run-ledger.sh dir
EOF
  exit 2
}

die() {
  local message="$1" code="${2:-1}"
  printf 'run-ledger: %s\n' "$message" >&2
  exit "$code"
}

resolve_main() {
  local common_dir
  common_dir="$(git rev-parse --path-format=absolute --git-common-dir)" || return 1
  MAIN="$(dirname "$common_dir")"
}

is_valid_run_id() {
  printf '%s' "$1" | grep -Eq "$RUN_ID_PATTERN"
}

is_valid_phase() {
  printf '%s' "$1" | grep -Eq "$PHASE_PATTERN"
}

runs_dir() {
  printf '%s/%s' "$MAIN" "$RUNS_SUBDIR"
}

pointer_path() {
  printf '%s/%s%s' "$(runs_dir)" "$1" "$POINTER_SUFFIX"
}

scratch_path() {
  printf '%s/%s%s' "$(runs_dir)" "$1" "$SCRATCH_SUFFIX"
}

delta_path() {
  printf '%s/%s%s' "$(runs_dir)" "$1" "$DELTA_SUFFIX"
}

record_path_under() {
  printf '%s/.claude/%s' "$1" "$RECORD_FILENAME"
}

# Sets `key` and `ledger` (script-scoped, deliberately not `local`) from the
# named run-id's pointer line. Fails on a missing pointer, an empty pointer
# or a line with no space (the malformed shape the sweep also targets).
read_pointer() {
  local run_id="$1" ptr line
  ptr="$(pointer_path "$run_id")"
  [ -f "$ptr" ] || return 1
  IFS= read -r line < "$ptr" || return 1
  key="${line%% *}"
  ledger="${line#* }"
  [ -n "$key" ] && [ -n "$ledger" ] && [ "$ledger" != "$line" ]
}

# Written to a temp file inside <dir> then `mv`d over so a reader never sees a
# partially written pointer.
write_pointer() {
  local run_id="$1" line="$2" ptr tmp
  ptr="$(pointer_path "$run_id")"
  tmp="$(mktemp "$(runs_dir)/.craft-run-ledger.XXXXXX")"
  printf '%s\n' "$line" > "$tmp"
  mv "$tmp" "$ptr"
}

ensure_header() {
  local target="$1"
  mkdir -p "$(dirname "$target")"
  [ -s "$target" ] && return 0
  printf '%s\n' "$LEDGER_HEADER" > "$target"
}

# Removes every pointer whose ledger path is not a regular file, or whose
# line is malformed — run before each open so a dead run never blocks a
# newest-key lookup.
sweep_stale_pointers() {
  local ptr run_id
  for ptr in "$(runs_dir)"/*"$POINTER_SUFFIX"; do
    [ -e "$ptr" ] || continue
    run_id="$(basename "$ptr" "$POINTER_SUFFIX")"
    if ! read_pointer "$run_id" || [ ! -f "$ledger" ]; then
      rm -f "$ptr"
    fi
  done
}

open_target() {
  local run_id="$1" flag="${2:-}"
  if [ "$flag" = "--in-place" ]; then
    record_path_under "$MAIN"
    return
  fi
  scratch_path "$run_id"
}

warn_if_replacing() {
  local run_id="$1"
  [ -f "$(pointer_path "$run_id")" ] || return 0
  printf 'run-ledger: open: replacing existing pointer for run-id %s\n' "$run_id" >&2
}

new_run_key() {
  printf '%s@%s' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

cmd_open() {
  local run_id="${1:-}" flag="${2:-}"
  [ -n "$run_id" ] || usage_exit
  is_valid_run_id "$run_id" || die "invalid run-id: $run_id" 2
  resolve_main || exit 1
  mkdir -p "$(runs_dir)"
  sweep_stale_pointers
  local target run_key
  target="$(open_target "$run_id" "$flag")"
  ensure_header "$target"
  warn_if_replacing "$run_id"
  run_key="$(new_run_key "$run_id")"
  write_pointer "$run_id" "$run_key $target"
  printf '%s %s\n' "$run_key" "$target"
}

cmd_append() {
  local run_id="${1:-}" phase="${2:-}"
  [ -n "$run_id" ] && [ -n "$phase" ] || usage_exit
  is_valid_run_id "$run_id" || die "invalid run-id: $run_id" 2
  is_valid_phase "$phase" || die "invalid phase: $phase" 2
  resolve_main || exit 1
  read_pointer "$run_id" || die "no open run: $run_id"
  [ -f "$ledger" ] || die "ledger is missing, not recreating: $ledger"
  local wrote=0 line
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    printf '%s %s %s\n' "$run_id" "$phase" "$line" >> "$ledger"
    wrote=1
  done
  [ "$wrote" -eq 1 ] || die "no non-blank input for $run_id $phase"
}

cmd_move() {
  local run_id="${1:-}" worktree="${2:-}"
  [ -n "$run_id" ] && [ -n "$worktree" ] || usage_exit
  is_valid_run_id "$run_id" || die "invalid run-id: $run_id" 2
  resolve_main || exit 1
  read_pointer "$run_id" || die "no open run: $run_id"
  [ "$ledger" = "$(scratch_path "$run_id")" ] || die "run-id $run_id is not an open scratch run"
  [ -d "$worktree" ] || die "no such worktree directory: $worktree"
  local target
  target="$(record_path_under "$(cd "$worktree" && pwd -P)")"
  ensure_header "$target"
  tail -n +2 "$ledger" >> "$target"
  write_pointer "$run_id" "$key $target"
  rm -f "$ledger"
  printf '%s %s\n' "$key" "$target"
}

# True when `candidate` should replace `current` as the newest-key winner:
# greatest run-key timestamp first, ties broken by the greatest run-key string.
is_newer_key() {
  local candidate="$1" current="$2"
  [ -z "$current" ] && return 0
  local candidate_ts="${candidate#*@}" current_ts="${current#*@}"
  if [ "$candidate_ts" != "$current_ts" ]; then
    [[ "$candidate_ts" > "$current_ts" ]]
    return
  fi
  [[ "$candidate" > "$current" ]]
}

locate_by_transcript() {
  local path="$1"
  resolve_main 2>/dev/null || return 0
  [ -d "$(runs_dir)" ] || return 0
  [ -n "$path" ] && [ -f "$path" ] && [ -r "$path" ] || return 0
  local best_key="" best_ledger="" ptr line cand_key cand_ledger
  for ptr in "$(runs_dir)"/*"$POINTER_SUFFIX"; do
    [ -e "$ptr" ] || continue
    IFS= read -r line < "$ptr" || continue
    cand_key="${line%% *}"; cand_ledger="${line#* }"
    [ -f "$cand_ledger" ] || continue
    grep -F -q -e "$cand_key" -- "$path" || continue
    is_newer_key "$cand_key" "$best_key" || continue
    best_key="$cand_key"; best_ledger="$cand_ledger"
  done
  [ -n "$best_key" ] || return 0
  printf '%s %s\n' "${best_key%%@*}" "$best_ledger"
}

locate_by_run() {
  local run_id="$1"
  is_valid_run_id "$run_id" || die "invalid run-id: $run_id" 2
  resolve_main 2>/dev/null || return 0
  read_pointer "$run_id" 2>/dev/null || return 0
  [ -f "$ledger" ] || return 0
  printf '%s %s\n' "$run_id" "$ledger"
}

cmd_locate() {
  local flag="${1:-}" arg="${2:-}"
  case "$flag" in
    --transcript) locate_by_transcript "$arg" ;;
    --run) [ -n "$arg" ] || usage_exit; locate_by_run "$arg" ;;
    *) usage_exit ;;
  esac
}

cmd_close() {
  local run_id="${1:-}"
  [ -n "$run_id" ] || usage_exit
  is_valid_run_id "$run_id" || die "invalid run-id: $run_id" 2
  resolve_main || exit 1
  rm -f "$(pointer_path "$run_id")" "$(scratch_path "$run_id")" "$(delta_path "$run_id")"
}

cmd_dir() {
  resolve_main || exit 1
  printf '%s\n' "$(runs_dir)"
}

case "${1:-}" in
  open) shift; cmd_open "$@" ;;
  append) shift; cmd_append "$@" ;;
  move) shift; cmd_move "$@" ;;
  locate) shift; cmd_locate "$@" ;;
  close) shift; cmd_close "$@" ;;
  dir) cmd_dir ;;
  '') usage_exit ;;
  *) usage_exit ;;
esac
