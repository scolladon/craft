#!/bin/bash
# craft — validate the docs/ tree structure: dated closed-program docs (the
# `-P<number>-` pattern, `SC5-*`, `SPIKE.md`) may live only under docs/archive/.
# Filename check only — prose/ADR references to those names are unaffected.
#
# Usage: docs-structure-lint.sh <docs-dir>
#        docs-structure-lint.sh --audience <dir>
#
# --audience enforces the top-level audience split: the only TRACKED entries
# directly under <dir> may be README.md, guides/, contributing/ — a loud fence
# against a stray file or a new top-level subdir creeping back in. Tracked-only
# (via `git ls-files`) so untracked developer junk (e.g. docs/.DS_Store) never
# trips it.
set -euo pipefail

if [ "${1:-}" = "--audience" ]; then
  dir="${2:?usage: docs-structure-lint.sh --audience <dir>}"
  [ -d "$dir" ] || { echo "docs-structure-lint: no such directory: $dir" >&2; exit 2; }

  root="$(git rev-parse --show-toplevel)"
  rel="$(cd "$dir" && pwd)"
  rel="${rel#"$root"/}"

  top_level=()
  while IFS= read -r entry; do
    top_level+=("$entry")
  done < <(git -C "$root" ls-files -- "$rel" | sed -E "s#^${rel}/##" | cut -d/ -f1 | sort -u)

  offenders=()
  for entry in "${top_level[@]}"; do
    case "$entry" in
      README.md|guides|contributing) : ;;
      *) offenders+=("$entry") ;;
    esac
  done

  if [ "${#offenders[@]}" -gt 0 ]; then
    printf 'docs-structure-lint: unexpected top-level entry under %s:\n' "$dir" >&2
    printf '  %s\n' "${offenders[@]}" >&2
    exit 2
  fi

  echo "docs-structure-lint: top-level audience shape OK — README.md + guides/ + contributing/."
  exit 0
fi

DOCS_DIR="${1:?usage: docs-structure-lint.sh <docs-dir>}"
[ -d "$DOCS_DIR" ] || { echo "docs-structure-lint: no such directory: $DOCS_DIR" >&2; exit 2; }

ARCHIVE_DIR="$DOCS_DIR/archive"

violations=()
while IFS= read -r file; do
  base="$(basename "$file")"
  case "$base" in
    SPIKE.md|SC5-*|*-P[0-9]*-*) : ;;
    *) continue ;;
  esac
  case "$file" in
    "$ARCHIVE_DIR"/*) continue ;;
  esac
  violations+=("$file")
done < <(find "$DOCS_DIR" -name '*.md' | sort)

if [ "${#violations[@]}" -gt 0 ]; then
  printf 'docs-structure-lint: dated doc(s) found outside docs/archive/:\n' >&2
  printf '  %s\n' "${violations[@]}" >&2
  exit 2
fi

echo "docs-structure-lint: no dated docs outside docs/archive/ — structure OK."
