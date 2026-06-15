#!/usr/bin/env bash
# Substrate gate — the single shared definition that CI and local both run.
# Slices that add new binaries append to this file so CI never references a
# binary before it exists.
set -euo pipefail

(cd engine && node --test) && bats test/ && shellcheck scripts/*.sh hooks/*.sh
