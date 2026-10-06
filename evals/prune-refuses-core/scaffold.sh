#!/usr/bin/env bash
set -euo pipefail
plugin_root="$(cd "$(dirname "$0")/../.." && pwd)"
cp -R "$plugin_root/contracts" .
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "chore: fixture base"
