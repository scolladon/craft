#!/usr/bin/env bash
# Resilience probe: once a ledger snapshot other than <skip> reaches PHASE-START(<phase>), wait
# <delay> s, then SIGKILL the claude process in tmux session <session> and log when.
set -uo pipefail
ledgers="${1:?ledger snapshot dir}"; skip="${2:?ledger file to ignore}"; phase="${3:?phase}"
delay="${4:-60}"; session="${5:-craft-driver}"; out="${6:?log file}"
until grep -l "PHASE-START($phase)" "$ledgers"/*.md 2>/dev/null | grep -vq "/$skip\$"; do sleep 10; done
printf '%s saw PHASE-START(%s) in %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$phase" "$(grep -l "PHASE-START($phase)" "$ledgers"/*.md | grep -v "/$skip\$")" >> "$out"
sleep "$delay"
pid="$(tmux display-message -p -t "$session" '#{pane_pid}')"
printf '%s SIGKILL pid %s (%s)\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$pid" "$(ps -o comm= -p "$pid")" >> "$out"
kill -9 "$pid"
