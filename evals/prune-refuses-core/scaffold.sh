#!/usr/bin/env bash
set -euo pipefail
if ! { git rev-parse --git-dir >/dev/null 2>&1 && ! git rev-parse -q --verify HEAD >/dev/null; }; then echo "scaffold: cwd is not a fresh eval sandbox" >&2; exit 1; fi
plugin_root="$(cd "$(dirname "$0")/../.." && pwd)"
cp -R "$plugin_root/contracts" .
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "chore: fixture base"
