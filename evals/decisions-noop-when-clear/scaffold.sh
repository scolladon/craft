#!/usr/bin/env bash
set -euo pipefail
git rev-parse -q --verify HEAD >/dev/null && { echo "scaffold: cwd is not a fresh eval sandbox" >&2; exit 1; }
src="$(cd "$(dirname "$0")" && pwd)/fixture"
cp -R "$src/." .
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "chore: fixture base"
