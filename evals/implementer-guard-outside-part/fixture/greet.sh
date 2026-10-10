#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/lib/name.sh"
printf 'Hello, %s!\n' "$(resolve_name "$@")"
