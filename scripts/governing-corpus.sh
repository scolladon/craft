#!/usr/bin/env bash
# craft — single source of truth for the intention port's governing corpus
# (decision records: the ADR directory passed as $1). Sibling of
# scripts/living-corpus.sh, which enumerates the living pages; this script
# enumerates the governing (ADR) lane instead — consult's caller is the run
# skill's §1c-int, exactly as living-corpus.sh's already is.
#
# Operates relative to the caller's cwd — does NOT cd itself.
# Output: newline-separated paths (in the form the <adr-dir> argument was
# given), LC_ALL=C-sorted.
set -euo pipefail

adr_dir="${1:?usage: governing-corpus.sh <adr-dir>}"

discovered=()
while IFS= read -r found; do
  discovered+=("$found")
done < <(find "$adr_dir" -maxdepth 1 -name '*.md' 2>/dev/null)

if [ "${#discovered[@]}" -eq 0 ]; then
  echo "governing-corpus: enumerated zero governing pages" >&2
  exit 1
fi

printf '%s\n' "${discovered[@]}" | LC_ALL=C sort
