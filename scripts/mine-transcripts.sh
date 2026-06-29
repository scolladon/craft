#!/usr/bin/env bash
# Thin wrapper: stream Claude transcript JSONL files and write usage report.
# All flags are forwarded to the usage-mine bin (--dir, --baseline, --since,
# --prices, --include-inline).
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="${SCRIPTS_DIR}/../engine"

node "${ENGINE_DIR}/bin/usage-mine.js" "$@"
