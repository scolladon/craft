#!/usr/bin/env bash
# craft — sync adapter agent mirrors from the shared craft-<role> agent bodies.
#
# Several adapters mirror the shared agents/*.md bodies at
# adapters/<adapter>/agents/craft-<role>.md. This tool replaces the BODY only —
# it never generates frontmatter. Adapters that keep their own frontmatter
# fence above the body have that fence, and the exact run of blank lines
# after its closing marker, preserved byte-for-byte; adapters whose mirrors
# carry no fence at all are treated as body-only (no fence is ever added).
#
# Usage: sync-adapter-agents.sh [--check|--write] [--root <dir>]
#   --check   Report drifted/missing mirrors; exit non-zero if any are found.
#             Read-only. This is the default.
#   --write   Rewrite each drifted mirror's body in place. A role present in
#             agents/ but absent from a mirror directory is reported as
#             "missing" — never created, in either mode.
#   --root    Repo root to operate under (test seam; defaults to the repo
#             this script lives in).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="check"

while [ $# -gt 0 ]; do
  case "$1" in
    --check)
      MODE="check"
      shift
      ;;
    --write)
      MODE="write"
      shift
      ;;
    --root)
      ROOT="${2:?usage: sync-adapter-agents.sh [--check|--write] [--root <dir>]}"
      shift 2
      ;;
    *)
      echo "sync-adapter-agents: unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

AGENTS_DIR="$ROOT/agents"
ADAPTERS_DIR="$ROOT/adapters"
[ -d "$AGENTS_DIR" ] || { echo "sync-adapter-agents: no such directory: $AGENTS_DIR" >&2; exit 2; }
[ -d "$ADAPTERS_DIR" ] || { echo "sync-adapter-agents: no such directory: $ADAPTERS_DIR" >&2; exit 2; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
shared_body_file="$TMP_DIR/shared-body"
mirror_body_file="$TMP_DIR/mirror-body"
new_content_file="$TMP_DIR/new-content"

# frontmatter_prefix <file> — the opening `---` fence through the closing
# fence, plus the exact run of blank lines immediately after it. Empty output
# if the file's very first line is not `---`.
frontmatter_prefix() {
  awk '
    NR==1 && $0=="---" { print; infence=1; next }
    infence && !closed { print; if ($0=="---") closed=1; next }
    closed && $0=="" { print; next }
    { exit }
  ' "$1"
}

# frontmatter_body <file> — the line-exact extraction rule shared with the
# per-adapter byte-identity guards: split at the `---` fences, take
# everything after the closing fence, then strip only the LEADING run of
# blank lines. On a fence-less file the whole content is the body, with its
# own leading blank-line run stripped the same way.
frontmatter_body() {
  awk '
    NR==1 && $0=="---" { infence=1; next }
    infence && !closed { if ($0=="---") closed=1; next }
    (closed || !infence) && !started && $0=="" { next }
    { started=1; print }
  ' "$1"
}

has_fence() {
  [ "$(head -n 1 "$1")" = "---" ]
}

roles=()
while IFS= read -r f; do
  roles+=("$(basename "$f" .md)")
done < <(find "$AGENTS_DIR" -maxdepth 1 -name '*.md' | sort)

# Mirroring adapters are discovered by the existence of adapters/*/agents/,
# never by a hardcoded list — an adapter with no agents/ directory (the pi
# shape) is not a mirroring adapter and is never reported.
adapters=()
while IFS= read -r d; do
  adapters+=("$(basename "$(dirname "$d")")")
done < <(find "$ADAPTERS_DIR" -mindepth 2 -maxdepth 2 -type d -name agents | sort)

problems=()
for adapter in "${adapters[@]}"; do
  for role in "${roles[@]}"; do
    shared_file="$AGENTS_DIR/$role.md"
    mirror_file="$ADAPTERS_DIR/$adapter/agents/craft-$role.md"

    if [ ! -f "$mirror_file" ]; then
      problems+=("sync-adapter-agents: $adapter/$role: missing")
      continue
    fi

    frontmatter_body "$shared_file" > "$shared_body_file"
    if has_fence "$mirror_file"; then
      frontmatter_body "$mirror_file" > "$mirror_body_file"
    else
      cp "$mirror_file" "$mirror_body_file"
    fi

    if cmp -s "$shared_body_file" "$mirror_body_file"; then
      continue
    fi

    problems+=("sync-adapter-agents: $adapter/$role: drifted")

    if [ "$MODE" = "write" ]; then
      if has_fence "$mirror_file"; then
        frontmatter_prefix "$mirror_file" > "$new_content_file"
        cat "$shared_body_file" >> "$new_content_file"
      else
        cp "$shared_body_file" "$new_content_file"
      fi
      mv "$new_content_file" "$mirror_file"
    fi
  done
done

if [ "${#problems[@]}" -gt 0 ]; then
  printf '%s\n' "${problems[@]}" >&2
  exit 1
fi

exit 0
