#!/usr/bin/env bash
# craft — single source of truth for the intention port's living corpus
# (docs/contributing/specs/*.md, docs/contributing/prd/DESIGN-*.md, docs/DOD.md,
# docs/guides/concepts.md, docs/guides/customizing.md, plus BACKLOG.md). Both scripts/ci.sh and
# test/intention-lint-ci.test.js shell out here so the corpus is enumerated in
# exactly one place.
#
# Operates relative to the caller's cwd — does NOT cd itself.
# Output: newline-separated repo-relative paths, LC_ALL=C-sorted.
set -euo pipefail

discovered=()
while IFS= read -r found; do
  discovered+=("$found")
done < <(
  {
    find docs/contributing/specs -maxdepth 1 -name '*.md'
    find docs/contributing/prd -maxdepth 1 -name 'DESIGN-*.md'
    find docs -maxdepth 1 -name 'DOD.md'
    find docs/guides -maxdepth 1 \( -name 'concepts.md' -o -name 'customizing.md' \)
  } 2>/dev/null
)

if [ "${#discovered[@]}" -eq 0 ]; then
  echo "living-corpus: enumerated zero living pages" >&2
  exit 1
fi

printf '%s\n' "${discovered[@]}" "BACKLOG.md" | LC_ALL=C sort
