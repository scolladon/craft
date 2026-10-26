#!/usr/bin/env bash
# craft — the run ledger's one write and locate surface.
#
# Every run file lives in the git common dir, which no commit can write:
#   <git-common-dir>/craft-runs/<run-id>.md       the run's append-only ledger
#   <git-common-dir>/craft-runs/<run-id>.pointer  "<run-key> <ledger-path>"
#   <git-common-dir>/craft-runs/<run-id>.impacts.md  the run's discovered-impacts store
#
# Usage: run-ledger.sh open <run-id>
#        run-ledger.sh append <run-id> <phase>
#        run-ledger.sh defer <run-id> <phase>
#        run-ledger.sh verdict <run-id> <impact-id> <verdict>
#        run-ledger.sh locate --transcript <path>
#        run-ledger.sh locate --run <run-id>
#        run-ledger.sh close <run-id>
#        run-ledger.sh dir
# append stamps each PHASE-START(<phase>): record with its own UTC clock.
# defer reads one impact entry on stdin, stores it as the next `## I<n>` block
# and ledgers a DEFERRED record; a malformed entry is refused, nothing written.
set -euo pipefail
export LC_ALL=C

readonly LEDGER_HEADER='# craft run record (append-only)'
readonly RUNS_SUBDIR='craft-runs'
readonly POINTER_SUFFIX='.pointer'
readonly LEDGER_SUFFIX='.md'
readonly IMPACTS_HEADER='# craft discovered impacts (append-only)'
readonly IMPACTS_SUFFIX='.impacts.md'
readonly IMPACT_HEADING_PATTERN='^## I[0-9]+$'
readonly IMPACT_ID_PATTERN='^I[1-9][0-9]*$'
readonly LOCUS_PATTERN='^locus: [^[:space:]]+$'
readonly KNOWN_REASONS='out of scope|needs its own decision|needs a probe|waits on an external trigger|adds feature behaviour|the fix did not pass its gate'
readonly RUN_ID_PATTERN='^[a-z0-9][a-z0-9-]*$'
readonly PHASE_PATTERN='^[a-z][a-z0-9-]*$'
readonly RUN_KEY_PATTERN='^[a-z0-9][a-z0-9-]*@[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
readonly UTC_STAMP_FORMAT='+%Y-%m-%dT%H:%M:%SZ'
# Absolute, so neither PATH nor an exported function can choose the clock.
readonly DATE_BIN='/bin/date'
readonly PHASE_START_PATTERN='^(PHASE-START\([a-z][a-z0-9-]*\):)( +(.*))?$'
readonly OPEN_RUN_EXIT=3
readonly TRIAGE_PHASE='impact-triage'

usage_exit() {
  cat >&2 <<'EOF'
usage: run-ledger.sh open <run-id>
       run-ledger.sh append <run-id> <phase>
       run-ledger.sh defer <run-id> <phase>
       run-ledger.sh verdict <run-id> <impact-id> <verdict>
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
  "$DATE_BIN" -u "$UTC_STAMP_FORMAT"
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

impacts_path() {
  printf '%s/%s%s' "$(runs_dir)" "$1" "$IMPACTS_SUFFIX"
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
# never sees a partial file and a leftover ledger with no open pointer never
# leaks its lines into the new run.
write_atomically() {
  local target="$1" content="$2" tmp
  if [ -L "$target" ] || [ -d "$target" ]; then die "refusing a symlinked or directory run file: $target"; fi
  tmp="$(mktemp "$(runs_dir)/.craft-run-ledger.XXXXXX")"
  printf '%s\n' "$content" > "$tmp"
  mv "$tmp" "$target"
}

# Removes every pointer whose line is malformed or whose ledger is gone — run
# before each open so a dead run never lingers in a lookup.
sweep_stale_pointers() {
  local ptr run_id
  for ptr in "$(runs_dir)"/*"$POINTER_SUFFIX"; do
    if [ ! -f "$ptr" ] || [ -L "$ptr" ]; then continue; fi
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

# A run stays open from `open` to `close`: no process outlives a tool call, so
# whether an open run is dead is the user's call, never this script's. Runs
# after the sweep, which has already dropped every pointer whose ledger is gone.
refuse_if_open() {
  local run_id="$1"
  load_trusted_pointer "$run_id" || return 0
  die "open: run-id $run_id is already open since ${key#*@} (ledger $ledger); refusing to discard it" "$OPEN_RUN_EXIT"
}

cmd_open() {
  [ $# -le 1 ] || usage_exit
  local run_id="${1:-}" target run_key
  require_run_id "$run_id"
  resolve_git_common || die "not inside a git repository's work tree"
  prepare_runs_dir
  sweep_stale_pointers
  refuse_if_open "$run_id"
  target="$(ledger_path "$run_id")"
  write_atomically "$target" "$LEDGER_HEADER"
  write_atomically "$(impacts_path "$run_id")" "$IMPACTS_HEADER"
  warn_if_replacing "$run_id"
  run_key="$run_id@$(utc_now)"
  write_atomically "$(pointer_path "$run_id")" "$run_key $target"
  printf '%s %s\n' "$run_key" "$target"
}

# The caller never supplies a phase-start time: a model-written one has been
# seen to postdate the very events it marks.
stamp_record() {
  local line="$1"
  if [[ ! $line =~ $PHASE_START_PATTERN ]]; then printf '%s' "$line"; return; fi
  [ -z "${BASH_REMATCH[3]}" ] || printf 'run-ledger: append: replaced a supplied PHASE-START time\n' >&2
  local token="${BASH_REMATCH[1]}" now
  now="$(utc_now)" || return
  printf '%s %s' "$token" "$now"
}

cmd_append() {
  local run_id="${1:-}" phase="${2:-}"
  [ -n "$phase" ] || usage_exit
  require_run_id "$run_id"
  is_valid_phase "$phase" || die "invalid phase: $phase" 2
  resolve_git_common || die "not inside a git repository's work tree"
  require_trusted_pointer "$run_id"
  [ -f "$ledger" ] || die "ledger is missing, not recreating: $ledger"
  local wrote=0 line record
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    record="$(stamp_record "$line")"
    printf '%s %s %s\n' "$run_id" "$phase" "$record" >> "$ledger"
    wrote=1
  done
  [ "$wrote" -eq 1 ] || die "no non-blank input for $run_id $phase"
}

# Number of lines of $1 matching the extended regex $2 (0 when none).
count_matching() {
  printf '%s\n' "$1" | grep -c -E -e "$2" || true
}

# A field is valid when exactly one line opens with `<field>:` and that line
# also fits the full pattern.
has_one_line() {
  local entry="$1" field="$2" pattern="$3"
  [ "$(count_matching "$entry" "^$field:")" -eq 1 ] && [ "$(count_matching "$entry" "$pattern")" -eq 1 ]
}

field_value() {
  printf '%s\n' "$1" | sed -n "s/^$2: //p"
}

is_known_reason() {
  [[ $1 =~ ^($KNOWN_REASONS)$ ]]
}

is_relative_locus() {
  [[ $1 != /* && $1 != '~'* ]]
}

has_known_reason() {
  has_one_line "$1" reason '^reason: .+$' || return 1
  is_known_reason "$(field_value "$1" reason)"
}

has_proof_body() {
  printf '%s\n' "$1" | awk '/^proof:$/ { inside = 1; next } /^expected: / { exit } inside && /[^[:space:]]/ { found = 1 } END { exit !found }'
}

# Sets `entry_error` to the first reason the entry is refused; empty when valid.
validate_entry() {
  local entry="$1"
  entry_error=''
  if [ "$(count_matching "$entry" '^#')" -ne 0 ]; then entry_error='a line starting with #'; return; fi
  has_one_line "$entry" title '^title: .*[^[:space:]]' || { entry_error='exactly one non-empty title line is required'; return; }
  has_one_line "$entry" locus "$LOCUS_PATTERN" || { entry_error='exactly one locus line without whitespace is required'; return; }
  is_relative_locus "$(field_value "$entry" locus)" || { entry_error='the locus must be a relative path'; return; }
  has_known_reason "$entry" || { entry_error='exactly one known reason line is required'; return; }
  has_one_line "$entry" expected '^expected: .*[^[:space:]]' || { entry_error='exactly one non-empty expected line is required'; return; }
  has_proof_body "$entry" || entry_error='a proof line followed by a body before expected is required'
}

require_writable_store() {
  local store="$1"
  [ -f "$store" ] || [ -L "$store" ] || die "impacts store is missing, not recreating: $store"
  if is_symlinked "$store"; then die "refusing a symlinked impacts store: $store"; fi
}

next_impact_id() {
  printf 'I%s' "$(( $(grep -c -E -e "$IMPACT_HEADING_PATTERN" "$1" || true) + 1 ))"
}

record_impact() {
  local run_id="$1" phase="$2" entry="$3" store id locus
  store="$(impacts_path "$run_id")"
  require_writable_store "$store"
  id="$(next_impact_id "$store")"
  locus="$(field_value "$entry" locus)"
  printf '\n## %s\n%s\n' "$id" "$entry" >> "$store"
  printf '%s %s DEFERRED(%s): %s %s\n' "$run_id" "$phase" "${locus%%:*}" "$id" "$(field_value "$entry" title)" >> "$ledger"
  printf '%s\n' "$id"
}

cmd_defer() {
  local run_id="${1:-}" phase="${2:-}" entry
  [ -n "$phase" ] || usage_exit
  require_run_id "$run_id"
  is_valid_phase "$phase" || die "invalid phase: $phase" 2
  entry="$(cat)"
  validate_entry "$entry"
  [ -z "$entry_error" ] || die "defer: $entry_error" 2
  resolve_git_common || die "not inside a git repository's work tree"
  require_trusted_pointer "$run_id"
  record_impact "$run_id" "$phase" "$entry"
}

# Sets `rationale` to the one non-blank stdin line; dies 2 on none or several.
read_rationale() {
  local input
  input="$(cat)"
  [ "$(count_matching "$input" '[^[:space:]]')" -eq 1 ] || die "verdict: exactly one non-blank rationale line is required" 2
  rationale="$input"
}

require_verdict_args() {
  [[ "${1:-}" =~ $IMPACT_ID_PATTERN ]] || die "verdict: invalid impact id: ${1:-}" 2
  case "${2:-}" in
    reject|backlog:ready|backlog:spike) ;;
    *) die "verdict: invalid verdict: ${2:-}" 2 ;;
  esac
}

require_open_impact() {
  local store="$1" id="$2"
  grep -q -x -e "## $id" "$store" || die "verdict: unknown impact id: $id" 2
  if grep -q -e "^### $id verdict:" "$store"; then die "verdict: already judged: $id" 2; fi
}

cmd_verdict() {
  local run_id="${1:-}" id="${2:-}" verdict="${3:-}" rationale store
  require_run_id "$run_id"
  require_verdict_args "$id" "$verdict"
  read_rationale
  resolve_git_common || die "not inside a git repository's work tree"
  require_trusted_pointer "$run_id"
  store="$(impacts_path "$run_id")"
  require_writable_store "$store"
  require_open_impact "$store" "$id"
  printf '\n### %s verdict: %s — %s\n' "$id" "$verdict" "$rationale" >> "$store"
  printf '%s %s TRIAGED(%s): %s — %s\n' "$run_id" "$TRIAGE_PHASE" "$id" "$verdict" "$rationale" >> "$ledger"
}

# One line per trusted pointer whose ledger still exists, `<key> <ledger>`,
# newest run-key first (timestamp, then key, both descending).
trusted_candidates() {
  local ptr run_id
  for ptr in "$(runs_dir)"/*"$POINTER_SUFFIX"; do
    [ -e "$ptr" ] || continue
    run_id="$(basename "$ptr" "$POINTER_SUFFIX")"
    if ! load_trusted_pointer "$run_id" || [ ! -f "$ledger" ]; then continue; fi
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
  rm -f "$(pointer_path "$run_id")" "$(ledger_path "$run_id")" "$(impacts_path "$run_id")"
}

cmd_dir() {
  resolve_git_common || die "not inside a git repository's work tree"
  printf '%s\n' "$(runs_dir)"
}

case "${1:-}" in
  open) shift; cmd_open "$@" ;;
  append) shift; cmd_append "$@" ;;
  defer) shift; cmd_defer "$@" ;;
  verdict) shift; cmd_verdict "$@" ;;
  locate) shift; cmd_locate "$@" ;;
  close) shift; cmd_close "$@" ;;
  dir) cmd_dir ;;
  '') usage_exit ;;
  *) usage_exit ;;
esac
