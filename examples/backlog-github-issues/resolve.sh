#!/usr/bin/env bash
# Backlog adapter: issue tracker integration via the gh CLI.
#
# Usage:
#   resolve.sh resolve <id>            — print { title, body } as JSON on stdout
#   resolve.sh complete <id> <refs...> — close the issue and append refs as a comment
#
# id-form: ^#?[0-9]+$ (e.g. 42 or #42)
# id is validated before any tool call and passed as a discrete argv element —
# never interpolated into a shell string so shell metacharacters are inert.
#
# Prerequisites: gh CLI, authenticated (gh auth login).
# Idempotency: closing an already-closed issue is a no-op for the resolve call;
# the complete command re-closes idempotently (the script exits 0 on a closed issue).

set -euo pipefail

readonly ID_PATTERN='^#?[0-9]+$'

operation="${1:?usage: resolve.sh resolve|complete <id> [refs...]}"
raw_id="${2:?id argument required}"

# Validate id-form before any tool call — first line of defence against injection.
if ! [[ "$raw_id" =~ $ID_PATTERN ]]; then
  printf 'blocker: id "%s" does not match required form %s\n' "$raw_id" "$ID_PATTERN" >&2
  exit 1
fi

# Strip optional leading # so gh receives a bare integer.
numeric_id="${raw_id#\#}"

case "$operation" in
  resolve)
    # argv: ["issue", "view", <id>, "--json", "title,body"]
    # numeric_id is a discrete positional — shell metacharacters in the value are inert.
    gh issue view "$numeric_id" --json title,body
    ;;
  complete)
    shift 2
    refs_comment="${*}"
    # argv: ["issue", "close", <id>, "--reason", "completed", "--comment", <refs>]
    # numeric_id is discrete; refs_comment is a single string literal argument.
    gh issue close "$numeric_id" --reason completed --comment "$refs_comment"
    ;;
  *)
    printf 'unknown operation: %s (expected resolve or complete)\n' "$operation" >&2
    exit 1
    ;;
esac
