#!/usr/bin/env bash
set -euo pipefail
if ! { git rev-parse --git-dir >/dev/null 2>&1 && ! git rev-parse -q --verify HEAD >/dev/null; }; then echo "scaffold: cwd is not a fresh eval sandbox" >&2; exit 1; fi
case_dir="$(cd "$(dirname "$0")" && pwd)"
commit() { git add -A && git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "$1"; }
cp -R "$case_dir/fixture/." .
commit "chore: fixture base"
cp -R "$case_dir/fixture-head/." .
commit "feat: add a shout flag to greet.sh"
