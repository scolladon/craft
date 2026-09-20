#!/usr/bin/env bash
# Thin wrapper: append one per-phase metrics row to the committed ledger from
# the current session's Claude transcripts. All flags are forwarded to the
# metrics-emit bin (--run, --phase, --session, --dir, --since, --ledger).
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="${SCRIPTS_DIR}/../engine"

node "${ENGINE_DIR}/bin/metrics-emit.js" "$@"
