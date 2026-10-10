#!/usr/bin/env bash
set -uo pipefail
root="$(dirname "$0")/.."
failures=0
report() { local title="$1" expected="$2" actual="$3"; if [ "$actual" = "$expected" ]; then echo "ok - $title"; else echo "FAIL - $title: expected '$expected', got '$actual'"; failures=$((failures + 1)); fi; }
check() { local title="$1" expected="$2"; shift 2; report "$title" "$expected" "$(bash "$root/greet.sh" "$@")"; }
check_name() { local title="$1" expected="$2"; shift 2; report "$title" "$expected" "$(. "$root/lib/name.sh"; resolve_name "$@")"; }
check "greets the world by default" "Hello, world!"
exit "$((failures > 0))"
