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

# run_intention_lint — enumerates the design's zero-config living corpus
# (docs/adapters/*.md, docs/DESIGN-*.md, docs/DOD.md, docs/GUIDE-customizing.md)
# plus BACKLOG.md, mirroring run_suite's zero-file discipline: a zero-file
# enumeration is a hard error, never a silent skip.
run_intention_lint() {
  local -a files=()
  local found
  while IFS= read -r found; do
    files+=("$found")
  done < <(bash scripts/living-corpus.sh)
  if [ "${#files[@]}" -eq 0 ]; then
    echo "ci: intention-lint corpus enumerated zero files" >&2
    exit 1
  fi
  node engine/bin/intention-lint.js "${files[@]}"
}
run_intention_lint

shellcheck scripts/*.sh hooks/*.sh && node engine/bin/pipeline-lint.js pipeline/default.yml && node engine/bin/pipeline-resolve.js pipeline/default.yml && node engine/bin/contracts-lint.js contracts \
  && for b in BACKLOG.md templates/backlog.md; do bash scripts/backlog-lint.sh "$b" || exit 1; done \
  && for d in templates/design.md docs/design/*.md; do bash scripts/design-lint.sh "$d" || exit 1; done \
  && bash scripts/docs-structure-lint.sh docs

# --- hygiene gates (workstream C): touched-diff stub + prose lints ---
# Posture is the manifest's resolved hygiene.gate (advisory | blocking); flipping
# to blocking is a one-line manifest edit, never a code change. Distinct block,
# non-adjacent to run_intention_lint, so each workstream reverts without
# conflicting on this file.
compute_touched() {
  local base f
  base="$(git merge-base HEAD main 2>/dev/null || true)"
  [ -n "$base" ] || return 0
  # NUL-delimited end to end (git -z in, printf '%s\0' out), so names with any
  # byte — non-ASCII, spaces, even embedded newlines — survive verbatim; skip
  # symlinks so a committed link cannot redirect a read outside the tree.
  git diff --no-ext-diff -z --name-only "$base"..HEAD 2>/dev/null \
    | while IFS= read -r -d '' f; do
        [ -e "$f" ] && [ ! -L "$f" ] && printf '%s\0' "$f"
      done
}
# Resolve the posture once. A bad gate value (or a crashed resolver) exits
# non-zero with its reason on stderr, and `|| echo advisory` degrades the run to
# advisory — fail-open, but the reason stays visible (no 2>-suppression).
hygiene_gate="$(node engine/bin/hygiene-gate.js .claude/workflow.md || echo advisory)"
# Compute the touched set once into a NUL-delimited temp file both gates read
# (|| true so a diff failure degrades to an empty set, never aborts ci.sh).
hygiene_touched="$(mktemp)"
trap 'rm -f "$hygiene_touched"' EXIT
compute_touched > "$hygiene_touched" || true
run_stub_lint() {
  local -a src=() waivers=()
  local f
  while IFS= read -r -d '' f; do
    [ -n "$f" ] || continue
    case "$f" in
      *.test.js) ;;
      test/*|*/test/*|test-helpers/*|*/test-helpers/*) ;;
      *.js|*.mjs|*.cjs|*.ts|*.sh) src+=("$f") ;;
      *.md) waivers+=(--waiver-source "$f") ;;
    esac
  done < "$hygiene_touched"
  [ "${#src[@]}" -eq 0 ] && return 0
  node engine/bin/stub-lint.js --gate "$hygiene_gate" ${waivers[@]+"${waivers[@]}"} -- "${src[@]}"
}
run_prose_lint() {
  local -a docs=() waivers=()
  local f
  while IFS= read -r -d '' f; do
    [ -n "$f" ] || continue
    case "$f" in
      docs/adr/*|docs/design/*|docs/archive/*) ;;  # provenance/design docs necessarily quote ban-list words — advisory noise
      *.md) docs+=("$f"); waivers+=(--waiver-source "$f") ;;
    esac
  done < "$hygiene_touched"
  [ "${#docs[@]}" -eq 0 ] && return 0
  node engine/bin/prose-lint.js --gate "$hygiene_gate" ${waivers[@]+"${waivers[@]}"} -- "${docs[@]}"
}
run_stub_lint
run_prose_lint
