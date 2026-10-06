#!/usr/bin/env bash
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)/fixture"
cp -R "$src/." .
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "chore: fixture base"
