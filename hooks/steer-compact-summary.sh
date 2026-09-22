#!/bin/bash
# craft — PreCompact: when this session is bound to a craft run, steer the
# compaction summary to keep the anchors a resumed run depends on.
set -euo pipefail

# Resolved without `dirname`, matching bound-run.sh's own resolution: an
# empty PATH must still let the jq-missing path inside bound_run report
# cleanly, and that requires no external command runs before it.
hook_dir="${BASH_SOURCE[0]%/*}"
[ "$hook_dir" = "${BASH_SOURCE[0]}" ] && hook_dir='.'
hook_dir="$(cd "$hook_dir" && pwd -P)"

# shellcheck source=hooks/bound-run.sh
source "${hook_dir}/bound-run.sh"

never_block steer-compact-summary

bound="$(bound_run)"
[ -n "$bound" ] || exit 0

readonly STEER_LIST_MAX_CHARS=200

# One POSIX awk pass over the whole ledger, keeping this run's
# PHASE-START/PHASE-DONE events in first-seen order and the last event per
# phase. Phases whose last event is START, in that order, are joined with
# ", " and cut to max_chars; an empty result reads "none recorded".
readonly STEER_IN_FLIGHT_AWK_PROGRAM="
  \$1 == id {
    if (index(\$3, \"PHASE-START(\") == 1) {
      phase = substr(\$3, 13)
      sub(/\):\$/, \"\", phase)
      kind = \"START\"
    } else if (index(\$3, \"PHASE-DONE(\") == 1) {
      phase = substr(\$3, 12)
      sub(/\):\$/, \"\", phase)
      kind = \"DONE\"
    } else {
      next
    }
    if (!(phase in seen)) {
      seen[phase] = 1
      order[++n] = phase
    }
    last[phase] = kind
  }
  END {
    list = \"\"
    for (i = 1; i <= n; i++) {
      p = order[i]
      if (last[p] != \"START\") continue
      list = (list == \"\") ? p : list \", \" p
    }
    while (gsub(control_chars, \"\", list)) {}
    if (list == \"\") list = \"none recorded\"
    print substr(list, 1, max_chars)
  }
"

# in_flight_phases <run-id> <ledger-path>: runs STEER_IN_FLIGHT_AWK_PROGRAM.
# awk's own diagnostic (e.g. an unreadable ledger) is left for never_block to
# report as the single stderr reason line, not duplicated here.
in_flight_phases() {
  local run_id="$1" ledger="$2"
  LC_ALL=C awk -v id="$run_id" -v max_chars="$STEER_LIST_MAX_CHARS" -v control_chars="$(craft_control_chars_ere)" \
    "$STEER_IN_FLIGHT_AWK_PROGRAM" "$ledger" 2>/dev/null
}

run_id="${bound%% *}"
ledger="${bound#* }"
in_flight="$(in_flight_phases "$run_id" "$ledger")"

printf "craft compaction note: craft run %s is bound to this session. Decide whose conversation you are summarising and apply only the matching paragraph.
If it is the craft orchestrator's (it drives the craft workflow and calls run-ledger.sh), the summary must keep verbatim: run-id %s; ledger %s; phase(s) in flight: %s; every commit hash that landed; any question put to the user and not yet answered, word for word; and the sentence \"The run ledger outranks this summary.\"
If it is a craft sub-agent's (it opens with a spawn prompt for one task and never calls run-ledger.sh), the summary must keep verbatim: the task statement of its spawn prompt; every file path it wrote; every commit hash it landed; the last step it completed. Leave out the run-id and ledger path: a sub-agent never writes the ledger.
If neither, ignore this note.
" "$run_id" "$run_id" "$ledger" "$in_flight"
