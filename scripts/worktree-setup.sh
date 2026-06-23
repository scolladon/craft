#!/bin/bash
# craft — branch-phase setup: install dependencies INSIDE the worktree.
# Never symlink the main checkout's dependency dir: it silently couples the branch's
# dependency state to main and breaks branch-isolated upgrades.
#
# Usage: worktree-setup.sh <worktree-path> [post-setup-script]
set -euo pipefail

WT="${1:?usage: worktree-setup.sh <worktree-path> [post-setup-script]}"
POST="${2:-}"
cd "$WT"

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/detect-ecosystem.sh
source "${SCRIPTS_DIR}/detect-ecosystem.sh"

installed=""
installed="$(detect_ecosystem .)" || installed=""

case "$installed" in
  npm)      npm ci || npm install ;;
  pnpm)     pnpm install --frozen-lockfile ;;
  yarn)     yarn install --frozen-lockfile ;;
  bun)      bun install ;;
  uv)       uv sync ;;
  poetry)   poetry install ;;
  cargo)    cargo fetch ;;
  go)       go mod download ;;
  bundler)  bundle install ;;
  composer) composer install ;;
  "")
    for sub in */; do
      if [ -d "$sub" ] && [ -f "${sub}package-lock.json" ]; then
        ( cd "$sub" && (npm ci || npm install) )
        installed="npm (nested: ${sub%/})"
        break
      fi
    done
    if [ -z "$installed" ]; then
      echo "craft-setup: no recognized lockfile/manifest — dependency install skipped (noted)."
    fi
    ;;
esac
[ -n "$installed" ] && echo "craft-setup: dependencies installed in-worktree via $installed."

if [ -n "$POST" ]; then
  if [ -x "$POST" ]; then "$POST" "$WT"; else bash "$POST" "$WT"; fi
  echo "craft-setup: post-setup script ran: $POST"
fi
