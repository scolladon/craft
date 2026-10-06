#!/usr/bin/env bash
set -euo pipefail
shout=false
if [ "${1:-}" = "--shout" ]; then
  shout=true
  shift
fi
greeting="$(printf 'Hello, %s!' "${1:-world}")"
if [ "$shout" = true ]; then
  greeting="$(printf '%s' "$greeting" | tr '[:lower:]' '[:upper:]')"
fi
printf '%s\n' "$greeting"
