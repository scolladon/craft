#!/usr/bin/env bash
# Substrate gate — the single shared definition that CI and local both run.
# Parts that add new binaries append to this file so CI never references a
# binary before it exists.
set -euo pipefail

# Resolve from repo root so relative paths and globs are call-site independent.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# run_suite <label> <test-dir> [cd-dir]
# Enumerates <test-dir>'s *.test.js files independently of node's own glob
# expansion (find, not node --test's glob) and passes the sorted list as
# explicit argv — a missing/renamed file is then a hard error, never a silent
# skip. Zero files found under <test-dir> is also a hard error.
run_suite() {
  local label="$1" suite_dir="$2" cd_dir="${3:-}"
  local -a files=()
  local found
  while IFS= read -r found; do
    files+=("$found")
  done < <(find "$suite_dir" -name '*.test.js' | sort)
  if [ "${#files[@]}" -eq 0 ]; then
    echo "ci: ${label} suite enumerated zero test files under ${suite_dir}" >&2
    exit 1
  fi

  local -a run_files=("${files[@]}")
  local run_cwd="."
  if [ -n "$cd_dir" ]; then
    run_cwd="$cd_dir"
    run_files=()
    local f
    for f in "${files[@]}"; do
      run_files+=("${f#"$cd_dir"/}")
    done
  fi

  local output status
  output="$(cd "$run_cwd" && node --test "${run_files[@]}" 2>&1)" && status=0 || status=$?
  echo "$output"
  [ "$status" -eq 0 ] || {
    echo "ci: ${label} node --test failed (exit ${status})" >&2
    exit "$status"
  }
}

run_suite engine engine/test engine
# Repo-root cwd/$HOME independence for the default-resolution engine tests
# (manifest-lint-main, contracts-lint-main, pipeline-resolve-main) is guarded
# by test/hermetic-suite.test.js under a hostile ambient — no need to rerun
# the full engine suite from repo root too.
run_suite adapters/pi adapters/pi/test adapters/pi
run_suite process test

shellcheck scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js pipeline/default.yml && node engine/bin/pipeline-resolve.js pipeline/default.yml && node engine/bin/contracts-lint.js contracts \
  && for b in BACKLOG.md templates/backlog.md; do bash scripts/backlog-lint.sh "$b" || exit 1; done \
  && for d in templates/design.md docs/design/*.md; do bash scripts/design-lint.sh "$d" || exit 1; done \
  && bash scripts/docs-structure-lint.sh docs
