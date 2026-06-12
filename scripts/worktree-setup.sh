#!/bin/bash
# forge — branch-phase setup: install dependencies INSIDE the worktree.
# Never symlink the main checkout's dependency dir: it silently couples the branch's
# dependency state to main and breaks branch-isolated upgrades.
#
# Usage: worktree-setup.sh <worktree-path> [post-setup-script]
set -euo pipefail

WT="${1:?usage: worktree-setup.sh <worktree-path> [post-setup-script]}"
POST="${2:-}"
cd "$WT"

installed=""
if   [ -f package-lock.json ]; then npm ci || npm install; installed="npm"
elif [ -f pnpm-lock.yaml ];    then pnpm install --frozen-lockfile; installed="pnpm"
elif [ -f yarn.lock ];         then yarn install --frozen-lockfile; installed="yarn"
elif [ -f bun.lockb ] || [ -f bun.lock ]; then bun install; installed="bun"
elif [ -f uv.lock ];           then uv sync; installed="uv"
elif [ -f poetry.lock ];       then poetry install; installed="poetry"
elif [ -f Cargo.toml ];        then cargo fetch; installed="cargo"
elif [ -f go.mod ];            then go mod download; installed="go"
elif [ -f Gemfile.lock ];      then bundle install; installed="bundler"
elif [ -f composer.lock ];     then composer install; installed="composer"
else
  echo "forge-setup: no recognized lockfile/manifest — dependency install skipped (noted)."
fi
[ -n "$installed" ] && echo "forge-setup: dependencies installed in-worktree via $installed."

if [ -n "$POST" ]; then
  if [ -x "$POST" ]; then "$POST" "$WT"; else bash "$POST" "$WT"; fi
  echo "forge-setup: post-setup script ran: $POST"
fi
