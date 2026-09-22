#!/usr/bin/env bash
# craft — the run ledger's one write and locate surface.
#
# Usage: run-ledger.sh open <run-id> [--in-place]
#        run-ledger.sh append <run-id> <phase>
#        run-ledger.sh move <run-id> <worktree>
#        run-ledger.sh locate --transcript <path>
#        run-ledger.sh locate --run <run-id>
#        run-ledger.sh snapshot <run-id>
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
readonly FINAL_SUFFIX='.final.md'
readonly IN_PLACE_FLAG='--in-place'
readonly RUN_ID_PATTERN='^[a-z0-9][a-z0-9-]*$'
readonly PHASE_PATTERN='^[a-z][a-z0-9-]*$'
readonly RUN_KEY_PATTERN='^[a-z0-9][a-z0-9-]*@[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
readonly UTC_STAMP_FORMAT='+%Y-%m-%dT%H:%M:%SZ'

usage_exit() {
  cat >&2 <<'EOF'
usage: run-ledger.sh open <run-id> [--in-place]
       run-ledger.sh append <run-id> <phase>
       run-ledger.sh move <run-id> <worktree>
       run-ledger.sh locate --transcript <path> | --run <run-id>
       run-ledger.sh snapshot <run-id>
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

# MAIN is physical so every path built from it compares byte-for-byte with
# the physical worktree roots.
resolve_main() {
  local common_dir
  common_dir="$(git rev-parse --path-format=absolute --git-common-dir)" || return 1
  MAIN="$(cd "$(dirname "$common_dir")" && pwd -P)"
}

# Whole-string matches: a value carrying a newline never passes on the
# strength of one matching line.
is_valid_run_id() {
  [[ $1 =~ $RUN_ID_PATTERN ]]
}

is_valid_phase() {
  [[ $1 =~ $PHASE_PATTERN ]]
}

is_valid_run_key() {
  [[ $1 =~ $RUN_KEY_PATTERN ]]
}

require_run_id() {
  [ -n "$1" ] || usage_exit
  is_valid_run_id "$1" || die "invalid run-id: $1" 2
}

utc_now() {
  date -u "$UTC_STAMP_FORMAT"
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

final_path() {
  printf '%s/%s%s' "$(runs_dir)" "$1" "$FINAL_SUFFIX"
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

# True when <path> or any directory between it and <root> is a symlink. A
# cloned repository can commit a link, so no ledger write may follow one.
has_symlink_below() {
  local path="$1" root="$2"
  while [ "$path" != "$root" ] && [ "$path" != "/" ]; do
    [ -L "$path" ] && return 0
    path="$(dirname "$path")"
  done
  return 1
}

is_git_tracked() {
  local path="$1"
  git -C "$(dirname "$path")" ls-files --error-unmatch -- "$(basename "$path")" >/dev/null 2>&1
}

refuse_unsafe_target() {
  local path="$1" root="$2"
  ! has_symlink_below "$path" "$root" || die "refusing a symlinked ledger path: $path"
  ! is_git_tracked "$path" || die "refusing a git-tracked ledger: $path"
}

worktree_roots() {
  local root
  git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r root; do
    if [ -d "$root" ]; then (cd "$root" && pwd -P); fi
  done
}

is_worktree_root() {
  local candidate="$1" root
  while IFS= read -r root; do
    [ "$root" = "$candidate" ] && return 0
  done < <(worktree_roots)
  return 1
}

# A run's ledger is its own scratch or the record file of one of this
# repository's worktrees — never an arbitrary path a pointer names.
is_run_ledger_path() {
  local run_id="$1" path="$2" root
  if [ "$path" = "$(scratch_path "$run_id")" ]; then
    has_symlink_below "$path" "$MAIN" && return 1
    return 0
  fi
  root="${path%/.claude/"$RECORD_FILENAME"}"
  [ "$path" = "$(record_path_under "$root")" ] && is_worktree_root "$root" || return 1
  has_symlink_below "$path" "$root" && return 1
  ! is_git_tracked "$path"
}

# Sets `key` and `ledger` only for a pointer nothing about which a cloned
# repository could have planted: an untracked regular file whose key names
# its own run-id with a past timestamp, and which names that run's ledger.
load_trusted_pointer() {
  local run_id="$1" ptr
  ptr="$(pointer_path "$run_id")"
  [ -f "$ptr" ] && [ ! -L "$ptr" ] || return 1
  read_pointer "$run_id" || return 1
  is_valid_run_key "$key" && [ "${key%%@*}" = "$run_id" ] || return 1
  [[ ! "${key#*@}" > "$(utc_now)" ]] || return 1
  is_run_ledger_path "$run_id" "$ledger" || return 1
  ! is_git_tracked "$ptr"
}

require_trusted_pointer() {
  local run_id="$1"
  [ -f "$(pointer_path "$run_id")" ] || die "no open run: $run_id"
  load_trusted_pointer "$run_id" || die "refusing an untrusted pointer for run-id: $run_id"
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

# Through a temp file and `mv`, so a leftover scratch from a crashed attempt
# of the same topic never leaks its lines into the new run.
replace_with_header() {
  local target="$1" tmp
  tmp="$(mktemp "$(dirname "$target")/.craft-run-ledger.XXXXXX")"
  printf '%s\n' "$LEDGER_HEADER" > "$tmp"
  mv "$tmp" "$target"
}

# Removes every untracked pointer whose line is malformed or whose ledger is
# gone — run before each open so a dead run never lingers in a lookup. A
# tracked or symlinked pointer is never touched: it is not this script's file.
sweep_stale_pointers() {
  local ptr run_id
  for ptr in "$(runs_dir)"/*"$POINTER_SUFFIX"; do
    [ -f "$ptr" ] && [ ! -L "$ptr" ] || continue
    ! is_git_tracked "$ptr" || continue
    run_id="$(basename "$ptr" "$POINTER_SUFFIX")"
    if ! read_pointer "$run_id" || [ ! -f "$ledger" ]; then
      rm -f "$ptr"
    fi
  done
}

prepare_runs_dir() {
  ! has_symlink_below "$(runs_dir)" "$MAIN" || die "refusing a symlinked run directory: $(runs_dir)"
  mkdir -p "$(runs_dir)"
}

open_target() {
  local run_id="$1" flag="$2"
  if [ "$flag" = "$IN_PLACE_FLAG" ]; then
    record_path_under "$MAIN"
    return
  fi
  scratch_path "$run_id"
}

# An in-place ledger is the checkout's own append-only history and keeps its
# content; a scratch always starts fresh.
start_ledger() {
  local target="$1" flag="$2"
  refuse_unsafe_target "$target" "$MAIN"
  if [ "$flag" = "$IN_PLACE_FLAG" ]; then
    ensure_header "$target"
    return
  fi
  replace_with_header "$target"
}

warn_if_replacing() {
  local run_id="$1"
  [ -f "$(pointer_path "$run_id")" ] || return 0
  printf 'run-ledger: open: replacing existing pointer for run-id %s\n' "$run_id" >&2
}

cmd_open() {
  local run_id="${1:-}" flag="${2:-}"
  if [ $# -gt 2 ] || { [ -n "$flag" ] && [ "$flag" != "$IN_PLACE_FLAG" ]; }; then usage_exit; fi
  require_run_id "$run_id"
  resolve_main || exit 1
  prepare_runs_dir
  sweep_stale_pointers
  local target run_key
  target="$(open_target "$run_id" "$flag")"
  start_ledger "$target" "$flag"
  warn_if_replacing "$run_id"
  run_key="$run_id@$(utc_now)"
  write_pointer "$run_id" "$run_key $target"
  printf '%s %s\n' "$run_key" "$target"
}

cmd_append() {
  local run_id="${1:-}" phase="${2:-}"
  [ -n "$phase" ] || usage_exit
  require_run_id "$run_id"
  is_valid_phase "$phase" || die "invalid phase: $phase" 2
  resolve_main || exit 1
  require_trusted_pointer "$run_id"
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
  [ -n "$worktree" ] || usage_exit
  require_run_id "$run_id"
  resolve_main || exit 1
  require_trusted_pointer "$run_id"
  [ "$ledger" = "$(scratch_path "$run_id")" ] || die "run-id $run_id is not an open scratch run"
  [ -d "$worktree" ] || die "no such worktree directory: $worktree"
  local root target
  root="$(cd "$worktree" && pwd -P)"
  is_worktree_root "$root" || die "not a worktree of this repository: $worktree"
  target="$(record_path_under "$root")"
  refuse_unsafe_target "$target" "$root"
  ensure_header "$target"
  tail -n +2 "$ledger" >> "$target"
  write_pointer "$run_id" "$key $target"
  rm -f "$ledger"
  printf '%s %s\n' "$key" "$target"
}

# One line per trusted pointer whose ledger still exists, `<key> <ledger>`,
# newest run-key first (timestamp, then key, both descending).
trusted_candidates() {
  local ptr run_id
  for ptr in "$(runs_dir)"/*"$POINTER_SUFFIX"; do
    [ -e "$ptr" ] || continue
    run_id="$(basename "$ptr" "$POINTER_SUFFIX")"
    load_trusted_pointer "$run_id" && [ -f "$ledger" ] || continue
    printf '%s %s %s\n' "${key#*@}" "$key" "$ledger"
  done | sort -r | cut -d' ' -f2-
}

# Scans newest first and stops at the first key the transcript holds, so a
# bound session reads the transcript once whatever the pointer count.
locate_by_transcript() {
  local path="$1" cand_key cand_ledger
  resolve_main 2>/dev/null || return 0
  [ -d "$(runs_dir)" ] || return 0
  [ -n "$path" ] && [ -f "$path" ] && [ -r "$path" ] || return 0
  while IFS=' ' read -r cand_key cand_ledger; do
    grep -F -q -e "$cand_key" -- "$path" || continue
    printf '%s %s\n' "${cand_key%%@*}" "$cand_ledger"
    return 0
  done < <(trusted_candidates)
}

locate_by_run() {
  local run_id="$1"
  is_valid_run_id "$run_id" || die "invalid run-id: $run_id" 2
  resolve_main 2>/dev/null || return 0
  load_trusted_pointer "$run_id" 2>/dev/null || return 0
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

# Keeps this run's own lines beside the pointer, so what `Done` reads after
# the worktree — and the ledger inside it — is torn down is never a summary.
cmd_snapshot() {
  local run_id="${1:-}" target tmp
  require_run_id "$run_id"
  resolve_main || exit 1
  require_trusted_pointer "$run_id"
  [ -f "$ledger" ] || die "ledger is missing: $ledger"
  target="$(final_path "$run_id")"
  refuse_unsafe_target "$target" "$MAIN"
  tmp="$(mktemp "$(runs_dir)/.craft-run-ledger.XXXXXX")"
  awk -v id="$run_id" '$1 == id' "$ledger" > "$tmp"
  mv "$tmp" "$target"
  printf '%s\n' "$target"
}

cmd_close() {
  local run_id="${1:-}"
  require_run_id "$run_id"
  resolve_main || exit 1
  rm -f "$(pointer_path "$run_id")" "$(scratch_path "$run_id")" "$(delta_path "$run_id")" "$(final_path "$run_id")"
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
  snapshot) shift; cmd_snapshot "$@" ;;
  close) shift; cmd_close "$@" ;;
  dir) cmd_dir ;;
  '') usage_exit ;;
  *) usage_exit ;;
esac
