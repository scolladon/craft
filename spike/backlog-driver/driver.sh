#!/usr/bin/env bash
# Drives an interactive Claude Code session in tmux through a queue of brief files:
# /craft:run one brief, wait for the run to finish (hook events + status file),
# /clear, next brief. A person can `tmux attach -t "$DRIVER_SESSION"` to answer an ask.
#
# usage: driver.sh <repo-dir> <queue-dir> <state-dir>
# env:   DRIVER_SESSION (craft-driver), DRIVER_BUDGET_EQUIV (40000000),
#        DRIVER_ENTRY_TIMEOUT_S (14400), DRIVER_MODEL (session default),
#        DRIVER_COMMAND (template, {brief} is replaced), DRIVER_TRUST_NEW_DIR (0)
# exit:  0 queue empty · 2 blocked · 3 timeout · 4 budget cap · 5 preflight · 6 unverified finish
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"; readonly HERE
readonly REPO="${1:?usage: driver.sh <repo-dir> <queue-dir> <state-dir>}"
readonly QUEUE="${2:?queue dir}"
readonly STATE="${3:?state dir}"
readonly SESSION="${DRIVER_SESSION:-craft-driver}"
readonly BUDGET_EQUIV="${DRIVER_BUDGET_EQUIV:-40000000}"
readonly ENTRY_TIMEOUT_S="${DRIVER_ENTRY_TIMEOUT_S:-14400}"
readonly POLL_S=5
readonly PREAPPROVED_FLAGS='--policy push=always --policy propose=always --policy integrate=always --policy teardown=always'
readonly COMMAND_TEMPLATE="${DRIVER_COMMAND:-/craft:run $PREAPPROVED_FLAGS {brief}}"
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
  ! tmux has-session -t "$SESSION" 2>/dev/null || stop_loop 5 "preflight: tmux session $SESSION already exists"
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

launch_session() {
  local model_flag=""; [ -n "${DRIVER_MODEL:-}" ] && model_flag="--model $DRIVER_MODEL"
  wait_for_claude_binary
  tmux new-session -d -s "$SESSION" -x 220 -y 60 -c "$REPO" \
    "env -u ANTHROPIC_API_KEY -u CLAUDECODE DRIVER_STATE='$STATE' DRIVER_BRIEF='$CURRENT_BRIEF' claude $model_flag --settings '$STATE/settings.json'"
  log "launched tmux session $SESSION in $REPO (attach: tmux attach -t $SESSION)"
  [ "${DRIVER_TRUST_NEW_DIR:-0}" = 1 ] && dismiss_trust_dialog
  wait_event 0 SessionStart "" 60 || stop_loop 5 "session did not start"
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

run_entry() {
  local source="$1" number="$2" placeholder='{brief}' brief mark
  brief="$(render_brief "$source" "$number")"
  [ "$number" -gt 1 ] && clear_context
  check_budget
  mark="$(event_count)"
  type_line "${COMMAND_TEMPLATE//"$placeholder"/$brief}"
  log "entry $number started: $(basename "$source") -> $brief"
  await_run "$number" "$mark"
}

main() {
  mkdir -p "$STATE"
  preflight
  write_settings
  launch_session
  local number=0 source
  for source in "$QUEUE"/*.md; do
    number=$((number + 1))
    run_entry "$source" "$number"
  done
  check_budget
  stop_loop 0 "backlog queue empty after $number entries — loop done"
}

main
