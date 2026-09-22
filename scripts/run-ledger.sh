#!/usr/bin/env bash
# craft — the run ledger's one write and locate surface.
#
# Every run file lives in the git common dir, which no commit can write:
#   <git-common-dir>/craft-runs/<run-id>.md       the run's append-only ledger
#   <git-common-dir>/craft-runs/<run-id>.pointer  "<run-key> <ledger-path>"
#
# Usage: run-ledger.sh open <run-id>
#        run-ledger.sh append <run-id> <phase>
#        run-ledger.sh locate --transcript <path>
#        run-ledger.sh locate --run <run-id>
#        run-ledger.sh close <run-id>
#        run-ledger.sh dir
set -euo pipefail
export LC_ALL=C

readonly LEDGER_HEADER='# craft run record (append-only)'
readonly RUNS_SUBDIR='craft-runs'
readonly POINTER_SUFFIX='.pointer'
readonly LEDGER_SUFFIX='.md'
readonly RUN_ID_PATTERN='^[a-z0-9][a-z0-9-]*$'
readonly PHASE_PATTERN='^[a-z][a-z0-9-]*$'
readonly RUN_KEY_PATTERN='^[a-z0-9][a-z0-9-]*@[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
readonly UTC_STAMP_FORMAT='+%Y-%m-%dT%H:%M:%SZ'

usage_exit() {
  cat >&2 <<'EOF'
usage: run-ledger.sh open <run-id>
       run-ledger.sh append <run-id> <phase>
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

# GIT_COMMON is physical, so every path built from it compares byte-for-byte.
# Git is asked with safe.bareRepository=explicit: a committed directory laid out
# like a bare repository (its own config may even claim a work tree) would
# otherwise be discovered as the git dir, handing the run files to whoever
# committed it. A `-c` setting is protected configuration, so no repository can
# override it; a real repository is still reached through its `.git`.
resolve_git_common() {
  local common_dir
  common_dir="$(git -c safe.bareRepository=explicit rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  [ "$(git -c safe.bareRepository=explicit rev-parse --is-inside-git-dir)" = false ] || return 1
  GIT_COMMON="$(cd "$common_dir" && pwd -P)"
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
  printf '%s/%s' "$GIT_COMMON" "$RUNS_SUBDIR"
}

pointer_path() {
  printf '%s/%s%s' "$(runs_dir)" "$1" "$POINTER_SUFFIX"
}

ledger_path() {
  printf '%s/%s%s' "$(runs_dir)" "$1" "$LEDGER_SUFFIX"
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

is_symlinked() {
  [ -L "$(runs_dir)" ] || [ -L "$1" ]
}

# Sets `key` and `ledger` only for a well-formed pointer: a regular file whose
# key names its own run-id with a past timestamp, and which names that run's
# own ledger — never an arbitrary path.
load_trusted_pointer() {
  local run_id="$1" ptr
  ptr="$(pointer_path "$run_id")"
  [ -f "$ptr" ] && ! is_symlinked "$ptr" || return 1
  read_pointer "$run_id" || return 1
  is_valid_run_key "$key" && [ "${key%%@*}" = "$run_id" ] || return 1
  [[ ! "${key#*@}" > "$(utc_now)" ]] || return 1
  [ "$ledger" = "$(ledger_path "$run_id")" ] && ! is_symlinked "$ledger"
}

require_trusted_pointer() {
  local run_id="$1"
  [ -f "$(pointer_path "$run_id")" ] || die "no open run: $run_id"
  load_trusted_pointer "$run_id" || die "refusing an untrusted pointer for run-id: $run_id"
}

# Written to a temp file inside the run directory then `mv`d over, so a reader
# never sees a partial file and a leftover from a crashed attempt of the same
# topic never leaks its lines into the new run.
write_atomically() {
  local target="$1" content="$2" tmp
  [ ! -L "$target" ] && [ ! -d "$target" ] || die "refusing a symlinked or directory run file: $target"
  tmp="$(mktemp "$(runs_dir)/.craft-run-ledger.XXXXXX")"
  printf '%s\n' "$content" > "$tmp"
  mv "$tmp" "$target"
}

# Removes every pointer whose line is malformed or whose ledger is gone — run
# before each open so a dead run never lingers in a lookup.
sweep_stale_pointers() {
  local ptr run_id
  for ptr in "$(runs_dir)"/*"$POINTER_SUFFIX"; do
    [ -f "$ptr" ] && [ ! -L "$ptr" ] || continue
    run_id="$(basename "$ptr" "$POINTER_SUFFIX")"
    if ! read_pointer "$run_id" || [ ! -f "$ledger" ]; then
      rm -f "$ptr"
    fi
  done
}

prepare_runs_dir() {
  [ ! -L "$(runs_dir)" ] || die "refusing a symlinked run directory: $(runs_dir)"
  mkdir -p "$(runs_dir)"
}

warn_if_replacing() {
  local run_id="$1"
  [ -f "$(pointer_path "$run_id")" ] || return 0
  printf 'run-ledger: open: replacing existing pointer for run-id %s\n' "$run_id" >&2
}

cmd_open() {
  [ $# -le 1 ] || usage_exit
  local run_id="${1:-}" target run_key
  require_run_id "$run_id"
  resolve_git_common || die "not inside a git repository's work tree"
  prepare_runs_dir
  sweep_stale_pointers
  target="$(ledger_path "$run_id")"
  write_atomically "$target" "$LEDGER_HEADER"
  warn_if_replacing "$run_id"
  run_key="$run_id@$(utc_now)"
  write_atomically "$(pointer_path "$run_id")" "$run_key $target"
  printf '%s %s\n' "$run_key" "$target"
}

cmd_append() {
  local run_id="${1:-}" phase="${2:-}"
  [ -n "$phase" ] || usage_exit
  require_run_id "$run_id"
  is_valid_phase "$phase" || die "invalid phase: $phase" 2
  resolve_git_common || die "not inside a git repository's work tree"
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
  resolve_git_common || return 0
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
  resolve_git_common || return 0
  load_trusted_pointer "$run_id" || return 0
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
  require_run_id "$run_id"
  resolve_git_common || die "not inside a git repository's work tree"
  rm -f "$(pointer_path "$run_id")" "$(ledger_path "$run_id")"
}

cmd_dir() {
  resolve_git_common || die "not inside a git repository's work tree"
  printf '%s\n' "$(runs_dir)"
}

case "${1:-}" in
  open) shift; cmd_open "$@" ;;
  append) shift; cmd_append "$@" ;;
  locate) shift; cmd_locate "$@" ;;
  close) shift; cmd_close "$@" ;;
  dir) cmd_dir ;;
  '') usage_exit ;;
  *) usage_exit ;;
esac
