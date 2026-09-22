# shellcheck shell=bash
# craft — shared hook helpers: fail-open wrapping and the run-ledger lookup
# every compaction hook binds a session through.
#
# Sourced only; never `set` here (inherits whatever the caller already set).

readonly BOUND_RUN_JQ_MISSING_MESSAGE='craft: jq is required to bind a run'

# C0 controls except tab and newline, plus DEL: ledger bytes reach hook stdout,
# and an escape sequence must never ride along to the terminal or the model.
craft_control_chars_ere() {
  printf '%s' '[\001-\010\013-\037\177]'
}

# Resolves the directory this file lives in with pure parameter expansion and
# builtins (never `dirname`): under an empty PATH, an external `dirname` call
# would fail before bound_run ever reaches its own jq check.
craft_hooks_dir() {
  local raw="${BASH_SOURCE[0]%/*}"
  [ "$raw" = "${BASH_SOURCE[0]}" ] && raw='.'
  (cd "$raw" && pwd -P)
}

# never_block <hook-name>: from here on, any non-zero exit status in this
# process is caught and turned into exit 0 plus one stderr reason line, so a
# craft hook can never block the event it is attached to.
never_block() {
  CRAFT_NEVER_BLOCK_HOOK_NAME="$1"
  trap 'craft_never_block_finish "$?"' EXIT
}

craft_never_block_finish() {
  local rc="$1"
  if [ "$rc" -ne 0 ]; then
    printf 'craft %s: failed (exit %d)\n' "$CRAFT_NEVER_BLOCK_HOOK_NAME" "$rc" >&2
  fi
  exit 0
}

# bound_run: reads the hook payload from stdin once and, when it names a
# transcript bound to a live run, prints "<run-id> <ledger-path>". Prints
# nothing on every unbound shape (missing jq, no transcript, no such cwd).
bound_run() {
  command -v jq >/dev/null || { printf '%s\n' "$BOUND_RUN_JQ_MISSING_MESSAGE" >&2; return 0; }

  local payload cwd transcript
  payload="$(cat)"
  transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // empty')"
  [ -n "$transcript" ] || return 0

  cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty')"
  [ -n "$cwd" ] || cwd="${CLAUDE_PROJECT_DIR:-}"
  [ -d "$cwd" ] || return 0

  ( cd "$cwd" && "$(craft_hooks_dir)/../scripts/run-ledger.sh" locate --transcript "$transcript" )
}
