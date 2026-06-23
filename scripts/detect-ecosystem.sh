#!/usr/bin/env bash
# Read-only ecosystem detection: maps a lockfile/manifest presence in a directory
# to one of the supported ecosystem tokens. Performs NO install or mutation.
#
# Sourceable: defines detect_ecosystem() for callers that source this file.
# Direct exec: calls detect_ecosystem "${1:-.}" and propagates its exit code.
set -euo pipefail

# detect_ecosystem <dir>
#
# Echoes one of: npm pnpm yarn bun uv poetry cargo go bundler composer
# Echoes nothing and returns 1 when no recognized lockfile/manifest is present.
# First-match precedence mirrors the original worktree-setup.sh if/elif chain.
detect_ecosystem() {
  local dir="${1:-.}"
  if   [ -f "${dir}/package-lock.json" ]; then echo "npm"
  elif [ -f "${dir}/pnpm-lock.yaml" ];    then echo "pnpm"
  elif [ -f "${dir}/yarn.lock" ];         then echo "yarn"
  elif [ -f "${dir}/bun.lockb" ] || [ -f "${dir}/bun.lock" ]; then echo "bun"
  elif [ -f "${dir}/uv.lock" ];           then echo "uv"
  elif [ -f "${dir}/poetry.lock" ];       then echo "poetry"
  elif [ -f "${dir}/Cargo.toml" ];        then echo "cargo"
  elif [ -f "${dir}/go.mod" ];            then echo "go"
  elif [ -f "${dir}/Gemfile.lock" ];      then echo "bundler"
  elif [ -f "${dir}/composer.lock" ];     then echo "composer"
  else return 1
  fi
}

# Direct-exec guard: only run when invoked as a script, not when sourced.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  detect_ecosystem "${1:-.}"
fi
