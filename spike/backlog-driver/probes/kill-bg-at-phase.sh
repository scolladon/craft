#!/usr/bin/env bash
# Resilience probe for driver-bg.sh: once a ledger snapshot reaches PHASE-START(<phase>), wait <delay> s,
# then SIGKILL the background session named in <state>/entry-<n>.started and log when.
set -uo pipefail
ledgers="${1:?ledger snapshot dir}"; phase="${2:?phase}"; delay="${3:-60}"; started="${4:?entry-N.started}"; out="${5:?log file}"
until grep -l "PHASE-START($phase)" "$ledgers"/*.md >/dev/null 2>&1; do sleep 10; done
printf '%s saw PHASE-START(%s)\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$phase" >> "$out"
sleep "$delay"
id="$(awk '{print $2}' "$started")"
pid="$(claude agents --json | python3 -c 'import json,sys; print(next((s["pid"] for s in json.load(sys.stdin) if s.get("id")==sys.argv[1]), ""))' "$id")"
printf '%s SIGKILL session %s pid %s (%s)\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$id" "$pid" "$(ps -o comm= -p "$pid")" >> "$out"
kill -9 "$pid"
