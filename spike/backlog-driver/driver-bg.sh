#!/usr/bin/env bash
# Drives a queue of brief files through `claude --bg` sessions, one fresh session per entry:
# start `/craft:run <brief>` in the background, watch it through hook events, the run's status
# file and `claude agents --json`, notify on an ask (answer with `claude attach <id>`), stop the
# session once the entry is verified, next brief.
#
# usage: driver-bg.sh <repo-dir> <queue-dir> <state-dir>
# env:   DRIVER_BUDGET_EQUIV (40000000), DRIVER_ENTRY_TIMEOUT_S (14400), DRIVER_MODEL (session default),
#        DRIVER_COMMAND (template, {brief} is replaced), DRIVER_MAX_RESUMES (2, per entry),
#        DRIVER_SUPERVISOR_GRACE_S (90 — how long a dead session is left to the supervisor)
# exit:  0 queue empty · 2 blocked · 3 timeout · 4 budget cap · 5 preflight · 6 unverified finish
#        7 resume cap or a resume that forked
# Restartable: entry-N.started holds "<event mark> <session id>"; a re-run skips finished entries
# and re-attaches to the in-flight session. The driver never resumes a session that is alive or
# that the supervisor may still restart: a driver-side resume of a live session forks a second run.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"; readonly HERE
readonly REPO="${1:?usage: driver-bg.sh <repo-dir> <queue-dir> <state-dir>}"
readonly QUEUE="${2:?queue dir}"
readonly STATE="${3:?state dir}"
readonly BUDGET_EQUIV="${DRIVER_BUDGET_EQUIV:-40000000}"
readonly ENTRY_TIMEOUT_S="${DRIVER_ENTRY_TIMEOUT_S:-14400}"
readonly MAX_RESUMES="${DRIVER_MAX_RESUMES:-2}"
readonly SUPERVISOR_GRACE_S="${DRIVER_SUPERVISOR_GRACE_S:-90}"
readonly POLL_S=5
readonly PREAPPROVED_FLAGS='--policy push=always --policy propose=always --policy integrate=always --policy teardown=always'
readonly DEFAULT_COMMAND="/craft:run $PREAPPROVED_FLAGS {brief}"
readonly COMMAND_TEMPLATE="${DRIVER_COMMAND:-$DEFAULT_COMMAND}"
readonly EVENTS="$STATE/events.jsonl"
readonly CURRENT_BRIEF="$STATE/current-brief.md"
readonly FORK_NOTE='started a copy'

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$STATE/driver.log"; }

notify() {
  local message="$1"
  log "NOTIFY $message"
  osascript -e "display notification \"${message//\"/\'}\" with title \"craft driver\" sound name \"Glass\"" 2>>"$STATE/driver.log" \
    || log "notify: osascript failed"
}

stop_loop() { notify "$2"; exit "$1"; }

event_count() { if [ -f "$EVENTS" ]; then wc -l < "$EVENTS" | tr -d ' '; else echo 0; fi; }

wait_for_claude_binary() {
  until command -v claude >/dev/null && claude --version >/dev/null 2>&1; do sleep "$POLL_S"; done
}

preflight() {
  wait_for_claude_binary
  [ -n "$(ls "$QUEUE"/*.md 2>/dev/null)" ] || stop_loop 0 "backlog queue empty — nothing to drive"
}

# Hook commands carry their env explicitly: a background session is not a child of this shell.
write_settings() {
  python3 - "$HERE" "$STATE" "$CURRENT_BRIEF" > "$STATE/settings.json" <<'EOF'
import json, sys
here, state, brief = sys.argv[1:4]
record = lambda name: [{'hooks': [{'type': 'command', 'command': f'env DRIVER_STATE={state} {here}/hook-event.sh {name}', 'timeout': 10}]}]
hooks = {name: record(name) for name in ('SessionStart', 'Stop', 'Notification', 'PermissionRequest', 'SessionEnd')}
hooks['PreToolUse'] = [{'matcher': 'Bash', 'hooks': [{'type': 'command', 'command': f'env DRIVER_BRIEF={brief} {here}/outward-guard.mjs', 'timeout': 10}]}]
print(json.dumps({'hooks': hooks}, indent=2))
EOF
}

# Prints one field of a background session from `claude agents --json --all` (empty when absent).
session_field() {
  claude agents --json --all 2>/dev/null | python3 -c '
import json, sys
wanted, field = sys.argv[1], sys.argv[2]
match = next((s for s in json.load(sys.stdin) if s.get("id") == wanted), {})
value = match.get(field)
print("" if value is None else value)' "$1" "$2"
}

session_alive() {
  local pid; pid="$(session_field "$1" pid)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

started_file() { printf '%s/entry-%s.started' "$STATE" "$1"; }

record_start() { printf '%s %s\n' "$2" "$3" > "$(started_file "$1")"; }

render_brief() {
  local source="$1" number="$2" rendered="$STATE/entry-$2.brief.md"
  sed -e "s|{{STATE}}|$STATE|g" -e "s|{{N}}|$number|g" "$source" > "$rendered"
  cp "$rendered" "$CURRENT_BRIEF"
  printf '%s' "$rendered"
}

spent_equiv() {
  local transcripts
  transcripts="$(python3 -c 'import json,sys; print("\n".join(sorted({json.loads(l)["payload"].get("transcript_path","") for l in open(sys.argv[1])} - {""})))' "$EVENTS" 2>/dev/null)"
  [ -z "$transcripts" ] && { echo 0; return; }
  # shellcheck disable=SC2086
  python3 "$HERE/budget.py" $transcripts
}

check_budget() {
  local spent; spent="$(spent_equiv)"
  log "budget: spent ${spent} equiv of cap ${BUDGET_EQUIV}"
  [ "$spent" -lt "$BUDGET_EQUIV" ] || stop_loop 4 "budget cap reached (${spent} >= ${BUDGET_EQUIV} equiv)"
}

verify_finished() {
  local pr="$1"
  case "$pr" in
    http*) ;;
    *) log "finish detail is not a PR url ($pr) — no PR state to verify"; return 0 ;;
  esac
  local state; state="$(gh pr view "$pr" --json state --jq .state 2>>"$STATE/driver.log")"
  log "verify: $pr state=$state"
  [ "$state" = MERGED ]
}

# Starts one background session; its short id lands in LAUNCHED_ID.
LAUNCHED_ID=""
launch_bg() {
  local prompt="$1" model_flag="" output id
  [ -n "${DRIVER_MODEL:-}" ] && model_flag="--model $DRIVER_MODEL"
  wait_for_claude_binary
  # shellcheck disable=SC2086
  output="$(cd "$REPO" && env -u ANTHROPIC_API_KEY -u CLAUDECODE claude --bg $model_flag --settings "$STATE/settings.json" "$prompt" 2>&1)"
  printf '%s\n' "$output" >> "$STATE/driver.log"
  id="$(sed -n 's/^backgrounded · \([0-9a-f]\{8\}\).*/\1/p' <<<"$output")"
  [ -n "$id" ] || stop_loop 5 "claude --bg did not start: $(head -1 <<<"$output")"
  LAUNCHED_ID="$id"
}

resume_prompt() {
  printf '%s' "This session was killed while it ran /craft:run on $1 and was not restarted. Resume that same craft run: rebuild it from its ledger as the craft:run skill's 'Rebuild after compaction' section says (run-ledger.sh locate), continue from where it stopped, and keep following the driver protocol in $1. Do not open a new run."
}

# Wakes a session the supervisor left dead, on its own id; a fork is stopped and ends the loop.
resume_dead() {
  local number="$1" id="$2" attempt_file="$STATE/entry-$1.resumes" attempts full output
  attempts=$(( $(cat "$attempt_file" 2>/dev/null || echo 0) + 1 ))
  [ "$attempts" -le "$MAX_RESUMES" ] || stop_loop 7 "entry $number: session $id died again after $MAX_RESUMES resumes"
  printf '%s\n' "$attempts" > "$attempt_file"
  full="$(session_field "$id" sessionId)"
  notify "entry $number: session $id stayed dead ${SUPERVISOR_GRACE_S}s — resuming it (attempt $attempts/$MAX_RESUMES)"
  output="$(cd "$REPO" && env -u ANTHROPIC_API_KEY -u CLAUDECODE claude --bg --resume "$full" "$(resume_prompt "$STATE/entry-$number.brief.md")" 2>&1)"
  printf '%s\n' "$output" >> "$STATE/driver.log"
  if grep -q "$FORK_NOTE" <<<"$output"; then
    local copy; copy="$(sed -n 's/^backgrounded · \([0-9a-f]\{8\}\).*/\1/p' <<<"$output")"
    claude stop "$copy" >> "$STATE/driver.log" 2>&1
    stop_loop 7 "entry $number: resume of $id forked $copy (stopped it) — attach and check $id"
  fi
}

# Polls until the run finishes. Notifies once per new ask; leaves a dead session to the supervisor
# for SUPERVISOR_GRACE_S before waking it itself.
await_run() {
  local number="$1" mark="$2" id="$3" status="$STATE/entry-$1.status" notified="" waited=0 dead_since=""
  local result verdict detail index waiting
  while [ "$waited" -lt "$ENTRY_TIMEOUT_S" ]; do
    if session_alive "$id"; then
      [ -n "$dead_since" ] && log "entry $number: session $id is alive again (pid $(session_field "$id" pid)) — supervisor recovered it"
      dead_since=""
    else
      [ -z "$dead_since" ] && { dead_since="$waited"; log "entry $number: session $id has no live pid (state $(session_field "$id" state)) — leaving it to the supervisor"; }
      [ $((waited - dead_since)) -ge "$SUPERVISOR_GRACE_S" ] && { resume_dead "$number" "$id"; dead_since=""; mark="$(event_count)"; record_start "$number" "$mark" "$id"; }
    fi
    result="$(python3 "$HERE/classify.py" "$EVENTS" "$mark" "$status")"
    verdict="$(jq -r .verdict <<<"$result")"; detail="$(jq -r .detail <<<"$result" | head -c 300)"; index="$(jq -r .index <<<"$result")"
    waiting="$(session_field "$id" waitingFor)"
    case "$verdict" in
      FINISHED) log "entry $number FINISHED $detail"; verify_finished "$detail" || stop_loop 6 "entry $number claims FINISHED but $detail is not merged"; return 0 ;;
      BLOCKED) stop_loop 2 "entry $number BLOCKED: $detail" ;;
    esac
    if [ -n "$waiting" ] || [ "$verdict" = ASKED ] || [ "$verdict" = PERMISSION ]; then
      # While agents --json flags the session as waiting, new hook events are the same ask.
      local key="waiting:$waiting"; [ -z "$waiting" ] && key="event:$index"
      [ "$key" != "$notified" ] && { notify "entry $number needs you ($verdict, ${waiting:-no agents flag}) — claude attach $id — $detail"; notified="$key"; }
    elif [ "$verdict" = WAITING-BG ] && [ "event:$index" != "$notified" ]; then
      log "entry $number waiting on a background task"; notified="event:$index"
    fi
    sleep "$POLL_S"; waited=$((waited + POLL_S))
  done
  stop_loop 3 "entry $number timed out after ${ENTRY_TIMEOUT_S}s"
}

run_entry() {
  local source="$1" number="$2" placeholder='{brief}' brief mark id
  brief="$(render_brief "$source" "$number")"
  check_budget
  mark="$(event_count)"
  launch_bg "${COMMAND_TEMPLATE//"$placeholder"/$brief}"; id="$LAUNCHED_ID"
  record_start "$number" "$mark" "$id"
  log "entry $number started: $(basename "$source") -> $brief in session $id (attach: claude attach $id)"
  await_run "$number" "$mark" "$id"
  claude stop "$id" >> "$STATE/driver.log" 2>&1 && log "entry $number: stopped session $id"
}

continue_entry() {
  local number="$1" mark id
  read -r mark id < "$(started_file "$number")"
  cp "$STATE/entry-$number.brief.md" "$CURRENT_BRIEF"
  log "entry $number was in flight in session $id (mark $mark) — continuing"
  await_run "$number" "$mark" "$id"
  claude stop "$id" >> "$STATE/driver.log" 2>&1 && log "entry $number: stopped session $id"
}

entry_outcome() { [ -f "$STATE/entry-$1.status" ] && head -1 "$STATE/entry-$1.status" | cut -d' ' -f1; }

main() {
  mkdir -p "$STATE"
  preflight
  write_settings
  local number=0 source
  for source in "$QUEUE"/*.md; do
    number=$((number + 1))
    case "$(entry_outcome "$number")" in
      FINISHED) log "entry $number already FINISHED — skipping"; continue ;;
      BLOCKED) stop_loop 2 "entry $number was BLOCKED in a previous invocation — clear its status to retry" ;;
    esac
    if [ -f "$(started_file "$number")" ]; then continue_entry "$number"; else run_entry "$source" "$number"; fi
  done
  check_budget
  stop_loop 0 "backlog queue empty after $number entries — loop done"
}

main
