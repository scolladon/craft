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
#
# Only records carrying a line-1 frontmatter fence are emitted. The governing
# lane's OUTPUT grows by use, but an unfiltered lane's INPUT would be the whole
# corpus from run one — the overwhelming majority of which classifies as
# no-subjects and is discarded on arrival. Filtering on the FENCE (not on
# `subjects:`) keeps a present-but-broken fence in the lane, so it still reads
# as broken rather than vanishing.
#
# Unlike its living-corpus sibling, ZERO records is normal, not an error: an
# empty governing lane is the ordinary pre-adoption state of every repo whose
# ADRs predate the declaration.
set -euo pipefail

adr_dir="${1:?usage: governing-corpus.sh <adr-dir>}"

# `find` has no `--` separator, so a value beginning with `-` would be parsed as
# a predicate rather than a path (on GNU find the path then defaults to `.`).
case "$adr_dir" in
  -*) adr_dir="./$adr_dir" ;;
esac

if [ ! -d "$adr_dir" ]; then
  echo "governing-corpus: not a directory: $adr_dir" >&2
  exit 1
fi

discovered=()
while IFS= read -r found; do
  [ -f "$found" ] || continue
  [ -L "$found" ] && continue
  IFS= read -r first_line < "$found" || first_line=''
  [ "$first_line" = '---' ] || continue
  discovered+=("$found")
done < <(find "$adr_dir" -maxdepth 1 -name '*.md')

if [ "${#discovered[@]}" -eq 0 ]; then
  echo "governing-corpus: no decision record carries a frontmatter fence yet" >&2
  exit 0
fi

printf '%s\n' "${discovered[@]}" | LC_ALL=C sort
