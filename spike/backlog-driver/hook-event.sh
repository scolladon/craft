#!/usr/bin/env bash
# Records one Claude Code hook event for the driver: the payload goes to events.jsonl,
# and <event>.marker carries the latest payload so the driver can poll a single file.
set -euo pipefail
event="${1:?usage: hook-event.sh <event-name>}"
state="${DRIVER_STATE:?DRIVER_STATE unset}"
payload="$(cat)"
stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$state"
printf '{"ts":"%s","event":"%s","payload":%s}\n' "$stamp" "$event" "${payload:-null}" >> "$state/events.jsonl"
printf '%s\n' "$payload" > "$state/$event.marker.tmp" && mv "$state/$event.marker.tmp" "$state/$event.marker"
