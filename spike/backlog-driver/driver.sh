#!/usr/bin/env bash
# Drives an interactive Claude Code session in tmux through a queue of brief files:
# /craft:run one brief, wait for the run to finish (hook events + status file),
# /clear, next brief. A person can `tmux attach -t "$DRIVER_SESSION"` to answer an ask.
#
# usage: driver.sh <repo-dir> <queue-dir> <state-dir>
# env:   DRIVER_SESSION (craft-driver), DRIVER_BUDGET_EQUIV (40000000),
#        DRIVER_ENTRY_TIMEOUT_S (14400), DRIVER_MODEL (session default),
#        DRIVER_COMMAND (template, {brief} is replaced), DRIVER_TRUST_NEW_DIR (0),
#        DRIVER_MAX_RESUMES (2, per entry)
# exit:  0 queue empty · 2 blocked · 3 timeout · 4 budget cap · 5 preflight · 6 unverified finish
#        7 resume cap
# Restartable: progress lives in <state-dir> (entry-N.started holds the event mark, entry-N.status
# the outcome). A re-run skips finished entries, adopts a live tmux session, and resumes a dead
# one with `claude --resume <last session id>`.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"; readonly HERE
readonly REPO="${1:?usage: driver.sh <repo-dir> <queue-dir> <state-dir>}"
readonly QUEUE="${2:?queue dir}"
readonly STATE="${3:?state dir}"
readonly SESSION="${DRIVER_SESSION:-craft-driver}"
readonly BUDGET_EQUIV="${DRIVER_BUDGET_EQUIV:-40000000}"
readonly ENTRY_TIMEOUT_S="${DRIVER_ENTRY_TIMEOUT_S:-14400}"
readonly POLL_S=5
readonly MAX_RESUMES="${DRIVER_MAX_RESUMES:-2}"
readonly PREAPPROVED_FLAGS='--policy push=always --policy propose=always --policy integrate=always --policy teardown=always'
readonly DEFAULT_COMMAND="/craft:run $PREAPPROVED_FLAGS {brief}"
readonly COMMAND_TEMPLATE="${DRIVER_COMMAND:-$DEFAULT_COMMAND}"
readonly EVENTS="$STATE/events.jsonl"
readonly CURRENT_BRIEF="$STATE/current-brief.md"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$STATE/driver.log"; }

notify() {
  local message="$1"
  log "NOTIFY $message"
  osascript -e "display notification \"${message//\"/\'}\" with title \"craft driver\" sound name \"Glass\"" 2>>"$STATE/driver.log" \
    || log "notify: osascript failed"
  tmux display-message -t "$SESSION" "craft driver: $message" 2>/dev/null || true
}

stop_loop() { notify "$2"; exit "$1"; }

event_count() { if [ -f "$EVENTS" ]; then wc -l < "$EVENTS" | tr -d ' '; else echo 0; fi; }

wait_for_claude_binary() {
  until command -v claude >/dev/null && claude --version >/dev/null 2>&1; do sleep "$POLL_S"; done
}

repo_is_trusted() {
  python3 -c 'import json,sys; p=json.load(open(sys.argv[1])).get("projects",{}).get(sys.argv[2],{}); sys.exit(0 if p.get("hasTrustDialogAccepted") else 1)' \
    "$HOME/.claude.json" "$REPO"
}

preflight() {
  command -v tmux >/dev/null || stop_loop 5 "preflight: tmux missing"
  wait_for_claude_binary
  repo_is_trusted || [ "${DRIVER_TRUST_NEW_DIR:-0}" = 1 ] || stop_loop 5 "preflight: $REPO is not a trusted folder"
  [ -n "$(ls "$QUEUE"/*.md 2>/dev/null)" ] || stop_loop 0 "backlog queue empty — nothing to drive"
}

write_settings() {
  python3 - "$("$HERE/driver-settings.sh")" "$HERE/outward-guard.mjs" > "$STATE/settings.json" <<'EOF'
import json, sys
settings = json.loads(sys.argv[1])
settings['hooks']['PreToolUse'] = [{'matcher': 'Bash', 'hooks': [{'type': 'command', 'command': sys.argv[2], 'timeout': 10}]}]
print(json.dumps(settings, indent=2))
EOF
}

# Waits until an event named <event> (and, when given, payload.source == <source>) lands after mark.
wait_event() {
  local mark="$1" name="$2" source="$3" timeout_s="$4" waited=0
  while [ "$waited" -lt "$timeout_s" ]; do
    python3 - "$EVENTS" "$mark" "$name" "$source" <<'EOF' && return 0
import json, os, sys
path, mark, name, source = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
lines = open(path).read().splitlines() if os.path.exists(path) else []
matches = (json.loads(line) for line in lines[mark:])
sys.exit(0 if any(e['event'] == name and source in ('', (e['payload'] or {}).get('source')) for e in matches) else 1)
EOF
    sleep "$POLL_S"; waited=$((waited + POLL_S))
  done
  return 1
}

dismiss_trust_dialog() {
  sleep 8
  tmux capture-pane -p -t "$SESSION" | grep -qi 'trust this folder' || return 0
  log "trust dialog shown (defaults to 'No, exit') -> Down Enter"
  tmux send-keys -t "$SESSION" Down; sleep 1; tmux send-keys -t "$SESSION" Enter
}

session_alive() { tmux has-session -t "$SESSION" 2>/dev/null; }

last_session_id() {
  [ -f "$EVENTS" ] || return 0
  python3 -c 'import json,sys; ids=[json.loads(l)["payload"].get("session_id","") for l in open(sys.argv[1]) if json.loads(l)["event"]=="SessionStart"]; print(ids[-1] if ids else "")' "$EVENTS"
}

# Launches claude in tmux; with a session id it resumes that conversation instead of starting fresh.
launch_session() {
  local resume_sid="${1:-}" mark model_flag="" resume_flag=""
  [ -n "${DRIVER_MODEL:-}" ] && model_flag="--model $DRIVER_MODEL"
  [ -n "$resume_sid" ] && resume_flag="--resume $resume_sid"
  mark="$(event_count)"
  wait_for_claude_binary
  tmux new-session -d -s "$SESSION" -x 220 -y 60 -c "$REPO" \
    "env -u ANTHROPIC_API_KEY -u CLAUDECODE DRIVER_STATE='$STATE' DRIVER_BRIEF='$CURRENT_BRIEF' claude $model_flag $resume_flag --settings '$STATE/settings.json'"
  log "launched tmux session $SESSION in $REPO ${resume_flag:-fresh} (attach: tmux attach -t $SESSION)"
  [ "${DRIVER_TRUST_NEW_DIR:-0}" = 1 ] && dismiss_trust_dialog
  wait_event "$mark" SessionStart "" 60 || stop_loop 5 "session did not start"
}

type_line() {
  tmux send-keys -t "$SESSION" -l "$1"; sleep 1; tmux send-keys -t "$SESSION" Enter
}

clear_context() {
  local mark; mark="$(event_count)"
  type_line "/clear"
  wait_event "$mark" SessionStart clear 60 \
    || stop_loop 5 "/clear did not start a fresh session"
  log "context cleared"
}

started_file() { printf '%s/entry-%s.started' "$STATE" "$1"; }

record_mark() { printf '%s\n' "$2" > "$(started_file "$1")"; }

resume_prompt() {
  printf '%s' "This session was killed while it ran /craft:run on $1. Resume that same craft run: rebuild it from its ledger as the craft:run skill's 'Rebuild after compaction' section says (run-ledger.sh locate), continue from where it stopped, and keep following the driver protocol in $1. Do not open a new run."
}

# Relaunches a dead session on its last conversation and tells the run to rebuild; the new
# event mark lands in entry-N.started.
resume_run() {
  local number="$1" brief="$STATE/entry-$1.brief.md" attempt_file="$STATE/entry-$1.resumes" attempts mark
  attempts=$(( $(cat "$attempt_file" 2>/dev/null || echo 0) + 1 ))
  [ "$attempts" -le "$MAX_RESUMES" ] || stop_loop 7 "entry $number: session died again after $MAX_RESUMES resumes"
  printf '%s\n' "$attempts" > "$attempt_file"
  notify "entry $number: session is gone — resuming (attempt $attempts/$MAX_RESUMES)"
  cp "$brief" "$CURRENT_BRIEF"
  launch_session "$(last_session_id)"
  mark="$(event_count)"
  type_line "$(resume_prompt "$brief")"
  record_mark "$number" "$mark"
  log "entry $number resume prompt sent (mark $mark)"
}

render_brief() {
  local source="$1" number="$2" rendered="$STATE/entry-$2.brief.md"
  sed -e "s|{{STATE}}|$STATE|g" -e "s|{{N}}|$number|g" "$source" > "$rendered"
  cp "$rendered" "$CURRENT_BRIEF"
  printf '%s' "$rendered"
}

spent_equiv() {
  local transcripts
  transcripts="$(python3 -c 'import json,sys; print("\n".join(sorted({json.loads(l)["payload"].get("transcript_path","") for l in open(sys.argv[1])} - {""})))' "$EVENTS")"
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

# Polls the classifier until the run finishes; notifies once per new ask/permission event.
await_run() {
  local number="$1" mark="$2" status="$STATE/entry-$1.status" notified=-1 waited=0 result verdict detail index
  while [ "$waited" -lt "$ENTRY_TIMEOUT_S" ]; do
    session_alive || { resume_run "$number"; mark="$(cat "$(started_file "$number")")"; notified=-1; }
    result="$(python3 "$HERE/classify.py" "$EVENTS" "$mark" "$status")"
    verdict="$(jq -r .verdict <<<"$result")"; detail="$(jq -r .detail <<<"$result" | head -c 300)"; index="$(jq -r .index <<<"$result")"
    case "$verdict" in
      FINISHED) log "entry $number FINISHED $detail"; verify_finished "$detail" || stop_loop 6 "entry $number claims FINISHED but $detail is not merged"; return 0 ;;
      BLOCKED) stop_loop 2 "entry $number BLOCKED: $detail" ;;
      ASKED | PERMISSION)
        [ "$index" != "$notified" ] && { notify "entry $number $verdict — attach: tmux attach -t $SESSION — $detail"; notified="$index"; } ;;
      WAITING-BG) [ "$index" != "$notified" ] && { log "entry $number waiting on a background task"; notified="$index"; } ;;
    esac
    sleep "$POLL_S"; waited=$((waited + POLL_S))
  done
  stop_loop 3 "entry $number timed out after ${ENTRY_TIMEOUT_S}s"
}

# A session this invocation just launched fresh has a clean context; any other needs /clear.
FRESH_SESSION=0

ensure_session() {
  if session_alive; then log "adopted live tmux session $SESSION"; return 0; fi
  launch_session; FRESH_SESSION=1
}

run_entry() {
  local source="$1" number="$2" placeholder='{brief}' brief mark
  brief="$(render_brief "$source" "$number")"
  ensure_session
  [ "$FRESH_SESSION" = 1 ] || clear_context
  FRESH_SESSION=0
  check_budget
  mark="$(event_count)"
  record_mark "$number" "$mark"
  type_line "${COMMAND_TEMPLATE//"$placeholder"/$brief}"
  log "entry $number started: $(basename "$source") -> $brief"
  await_run "$number" "$mark"
}

# Re-enters an entry a previous driver invocation started: adopt or resume, then await.
continue_entry() {
  local number="$1" mark
  mark="$(cat "$(started_file "$number")")"
  log "entry $number was in flight (mark $mark) — continuing"
  cp "$STATE/entry-$number.brief.md" "$CURRENT_BRIEF"
  session_alive && log "adopted live tmux session $SESSION"
  FRESH_SESSION=0
  await_run "$number" "$mark"
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
