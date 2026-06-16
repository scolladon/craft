#!/usr/bin/env bash
# Substrate gate — the single shared definition that CI and local both run.
# Slices that add new binaries append to this file so CI never references a
# binary before it exists.
set -euo pipefail

# Resolve from repo root so relative paths and globs are call-site independent.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(cd engine && node --test) && bats test/ && shellcheck scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js pipeline/default.yml && node engine/bin/pipeline-resolve.js pipeline/default.yml && node engine/bin/contracts-lint.js contracts
