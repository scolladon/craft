#!/usr/bin/env bash
# Prints the --settings JSON that registers the driver's hooks for one driven session.
set -euo pipefail
hook="$(cd "$(dirname "$0")" && pwd)/hook-event.sh"
cat <<JSON
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "$hook SessionStart", "timeout": 10}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "$hook Stop", "timeout": 10}]}],
    "Notification": [{"hooks": [{"type": "command", "command": "$hook Notification", "timeout": 10}]}],
    "PermissionRequest": [{"hooks": [{"type": "command", "command": "$hook PermissionRequest", "timeout": 10}]}]
  }
}
JSON
