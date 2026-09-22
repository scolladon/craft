#!/bin/bash
# craft — SessionStart(compact): when this session is bound to a craft run,
# print a reorientation block so the post-compaction summary is not the only
# surviving memory of that run.
set -euo pipefail

# Resolved without `dirname`, matching bound-run.sh's own resolution: an
# empty PATH must still let the jq-missing path inside bound_run report
# cleanly, and that requires no external command runs before it.
hook_dir="${BASH_SOURCE[0]%/*}"
[ "$hook_dir" = "${BASH_SOURCE[0]}" ] && hook_dir='.'
hook_dir="$(cd "$hook_dir" && pwd -P)"

# shellcheck source=hooks/bound-run.sh
source "${hook_dir}/bound-run.sh"

never_block reorient-after-compact

bound="$(bound_run)"
[ -n "$bound" ] || exit 0

readonly REORIENT_TAIL_MAX_LINES=30
readonly REORIENT_TAIL_MAX_CHARS=200

# reorient_tail <run-id> <ledger-path>: one awk pass over the whole ledger,
# keeping only this run's lines, cut to REORIENT_TAIL_MAX_CHARS each, printing
# the tail header then the last REORIENT_TAIL_MAX_LINES of them. awk's own
# diagnostic (e.g. an unreadable ledger) is left for never_block to report as
# the single stderr reason line, not duplicated here.
reorient_tail() {
  local run_id="$1" ledger="$2"
  LC_ALL=C awk -v id="$run_id" -v max_lines="$REORIENT_TAIL_MAX_LINES" -v max_chars="$REORIENT_TAIL_MAX_CHARS" \
    -v control_chars="$(craft_control_chars_ere)" '
    $1 == id {
      n++
      line = $0
      while (gsub(control_chars, "", line)) {}
      buf[n] = substr(line, 1, max_chars)
    }
    END {
      k = n
      if (k > max_lines) k = max_lines
      printf "Ledger tail (last %d of %d lines of run %s):\n", k, n, id
      start = n - k + 1
      for (i = start; i <= n; i++) print buf[i]
    }
  ' "$ledger" 2>/dev/null
}

run_id="${bound%% *}"
ledger="${bound#* }"
craft_root="$(cd "${hook_dir}/.." && pwd -P)"
tail_block="$(reorient_tail "$run_id" "$ledger")"

# The backtick is carried through a variable rather than written literally
# inside the single-quoted format string below, so the format string never
# contains a character that reads as an (unintended) expansion marker.
backtick='`'

printf 'craft reorient — if you are not the craft orchestrator driving run %s, ignore everything after this paragraph. Craft sub-agent: your task is still the prompt you were spawned with; re-derive your progress from %sgit status%s, %sgit log%s and the files you wrote; never repeat a commit that already landed.
Orchestrator: your context was just compacted. Trust the run ledger over the summary.
Ledger: %s
Rebuild (skills/run/SKILL.md, "Rebuild after compaction"):
1. Re-run §0 steps 0b, 1 and 1b with the flags on this run'"'"'s RESOLVE: line.
2. load() the memory store; consult() the intention view.
3. Pipe that Resolution into: node %s/engine/bin/run-state.js %s --run %s
4. Resume every inFlight phase per the resume table, then walk from next.
%s
' "$run_id" "$backtick" "$backtick" "$backtick" "$backtick" "$ledger" "$craft_root" "$ledger" "$run_id" "$tail_block"
