#!/usr/bin/env bash
# Thin wrapper: report how a driven run ended (active | finished | blocked).
# All arguments are forwarded to the driver-state bin; its exit code is kept.
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="${SCRIPTS_DIR}/../engine"

node "${ENGINE_DIR}/bin/driver-state.js" "$@"
