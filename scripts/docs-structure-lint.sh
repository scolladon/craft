#!/bin/bash
# craft — validate the docs/ tree structure: dated closed-program docs (the
# `-P<number>-` pattern, `SC5-*`, `SPIKE.md`) may live only under docs/archive/.
# Filename check only — prose/ADR references to those names are unaffected.
#
# Usage: docs-structure-lint.sh <docs-dir>
set -euo pipefail

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
