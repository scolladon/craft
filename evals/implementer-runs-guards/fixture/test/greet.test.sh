#!/usr/bin/env bash
set -uo pipefail
sut="$(dirname "$0")/../greet.sh"
failures=0
check() { local title="$1" expected="$2" actual; shift 2; actual="$(bash "$sut" "$@")"; if [ "$actual" = "$expected" ]; then echo "ok - $title"; else echo "FAIL - $title: expected '$expected', got '$actual'"; failures=$((failures + 1)); fi; }
check "greets the world by default" "Hello, world!"
exit "$((failures > 0))"
