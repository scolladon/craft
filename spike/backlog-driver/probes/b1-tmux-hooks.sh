#!/usr/bin/env bash
# Probe b1: which hooks fire in an interactive tmux session at idle, at a pending
# AskUserQuestion, after answering via send-keys, and after /clear.
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
ev="$here/evidence/b1"; rm -rf "$ev"; mkdir -p "$ev/state"
proj="$(mktemp -d "${TMPDIR%/}/drvprobe-b1.XXXX")"; (cd "$proj" && git init -q)
"$here/driver-settings.sh" > "$ev/settings.json"
s=drvb1
log() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*" | tee -a "$ev/timeline.log"; }
snap() { tmux capture-pane -p -t "$s" > "$ev/pane-$1.txt"; }
wait_new() { # wait until events.jsonl has more than $1 lines, up to $2 s
  local n="$1" t="$2" i=0
  while [ "$(count)" -le "$n" ] && [ $i -lt $t ]; do sleep 1; i=$((i+1)); done
}
count() { if [ -f "$ev/state/events.jsonl" ]; then wc -l < "$ev/state/events.jsonl" | tr -d ' '; else echo 0; fi; }
until command -v claude >/dev/null && claude --version >/dev/null 2>&1; do sleep 5; done
tmux kill-session -t "$s" 2>/dev/null
tmux new-session -d -s "$s" -x 200 -y 50 -c "$proj" \
  "env -u ANTHROPIC_API_KEY -u CLAUDECODE DRIVER_STATE='$ev/state' claude --model haiku --settings '$ev/settings.json'"
log "launched in $proj"; sleep 8; snap 01-launch
# Trust dialog for a fresh dir: accept with Enter if shown.
if grep -qi "trust" "$ev/pane-01-launch.txt"; then log "trust dialog shown -> Down Enter"; tmux send-keys -t "$s" Down; sleep 1; tmux send-keys -t "$s" Enter; sleep 5; snap 02-after-trust; fi
wait_new 0 20; log "events after start: $(count)"
n=$(count)
tmux send-keys -t "$s" -l "Use the AskUserQuestion tool to ask me which colour to write, red or blue. Then write colour.txt with the answer and stop."
sleep 1; tmux send-keys -t "$s" Enter; log "sent ask prompt"
wait_new "$n" 90; sleep 5; log "events after ask prompt: $(count)"; snap 03-ask-pending
n=$(count)
tmux send-keys -t "$s" Enter; log "sent Enter to pick first option"
wait_new "$n" 90; sleep 3; log "events after answer: $(count)"; snap 04-after-answer
ls "$proj" > "$ev/proj-ls.txt"; cat "$proj/colour.txt" >> "$ev/proj-ls.txt" 2>/dev/null
n=$(count)
tmux send-keys -t "$s" -l "/clear"; sleep 1; tmux send-keys -t "$s" Enter; log "sent /clear"
wait_new "$n" 30; sleep 2; log "events after clear: $(count)"; snap 05-after-clear
n=$(count)
tmux send-keys -t "$s" -l "Reply with the single word PONG."; sleep 1; tmux send-keys -t "$s" Enter; log "sent pong prompt"
wait_new "$n" 60; sleep 2; log "events after pong: $(count)"; snap 06-after-pong
tmux kill-session -t "$s"; log "killed"
echo "$proj" > "$ev/project-path"
