#!/usr/bin/env bats

load helpers/worktree

SCRIPTS_DIR="${BATS_TEST_DIRNAME}/../scripts"

DIR=""

setup() {
  DIR="$(mktemp -d "${BATS_TMPDIR}/craft-eco-XXXXXX")"
}

teardown() {
  rm -rf "$DIR"
}

# ---------------------------------------------------------------------------
# Source-guard: sourcing defines the function without executing detection
# ---------------------------------------------------------------------------

@test "Given the helper is sourced, detect_ecosystem is defined and no detection ran" {
  # shellcheck disable=SC1090
  run bash -c "source '${SCRIPTS_DIR}/detect-ecosystem.sh'; declare -f detect_ecosystem > /dev/null && echo defined"
  [ "$status" -eq 0 ]
  [[ "$output" == *"defined"* ]]
}

# ---------------------------------------------------------------------------
# First-match precedence: each recognized lockfile / manifest
# ---------------------------------------------------------------------------

@test "Given a dir with package-lock.json, when detect_ecosystem runs, then it echoes npm" {
  touch "$DIR/package-lock.json"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "npm" ]
}

@test "Given a dir with pnpm-lock.yaml, when detect_ecosystem runs, then it echoes pnpm" {
  touch "$DIR/pnpm-lock.yaml"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "pnpm" ]
}

@test "Given a dir with yarn.lock, when detect_ecosystem runs, then it echoes yarn" {
  touch "$DIR/yarn.lock"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "yarn" ]
}

@test "Given a dir with go.mod, when detect_ecosystem runs, then it echoes go" {
  touch "$DIR/go.mod"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "go" ]
}

@test "Given a dir with bun.lockb, when detect_ecosystem runs, then it echoes bun (first arm of the OR)" {
  touch "$DIR/bun.lockb"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "bun" ]
}

@test "Given a dir with bun.lock, when detect_ecosystem runs, then it echoes bun (second arm of the OR)" {
  touch "$DIR/bun.lock"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "bun" ]
}

@test "Given a dir with uv.lock, when detect_ecosystem runs, then it echoes uv" {
  touch "$DIR/uv.lock"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "uv" ]
}

@test "Given a dir with poetry.lock, when detect_ecosystem runs, then it echoes poetry" {
  touch "$DIR/poetry.lock"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "poetry" ]
}

@test "Given a dir with Cargo.toml, when detect_ecosystem runs, then it echoes cargo" {
  touch "$DIR/Cargo.toml"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "cargo" ]
}

@test "Given a dir with Gemfile.lock, when detect_ecosystem runs, then it echoes bundler" {
  touch "$DIR/Gemfile.lock"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "bundler" ]
}

@test "Given a dir with composer.lock, when detect_ecosystem runs, then it echoes composer" {
  touch "$DIR/composer.lock"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "composer" ]
}

@test "Given a dir with no recognized lockfile or manifest, when detect_ecosystem runs, then it echoes nothing and returns non-zero" {
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -ne 0 ]
  [ "$output" = "" ]
}

@test "Given a dir with package-lock.json and pnpm-lock.yaml, when detect_ecosystem runs, then it echoes npm (first-match wins)" {
  touch "$DIR/package-lock.json"
  touch "$DIR/pnpm-lock.yaml"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ "$output" = "npm" ]
}

@test "Given detect-ecosystem.sh sourced and run on a package-lock.json fixture dir, when called, then no node_modules appears (detection only, no install)" {
  touch "$DIR/package-lock.json"
  run bash "${SCRIPTS_DIR}/detect-ecosystem.sh" "$DIR"
  [ "$status" -eq 0 ]
  [ ! -d "$DIR/node_modules" ]
}
