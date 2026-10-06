#!/usr/bin/env bash
set -euo pipefail
actual="$(bash "$(dirname "$0")/../greet.sh" Ada)"
[ "$actual" = "Hello, Ada!" ] || { echo "expected 'Hello, Ada!', got '$actual'" >&2; exit 1; }
echo "ok - greets by name"
