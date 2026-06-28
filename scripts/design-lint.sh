#!/bin/bash
# craft — validate a design doc against the design structure (templates/design.md).
# Checks that required section headings are present.
#
# Usage: design-lint.sh <design-file>
set -euo pipefail

DESIGN="${1:?usage: design-lint.sh <design-file>}"
[ -f "$DESIGN" ] || { echo "design-lint: no such file: $DESIGN" >&2; exit 2; }

REQUIRED="## Context|## Requirements|## Design|## Decision candidates|## Test strategy|## Out of scope"

awk -v req="$REQUIRED" '
  BEGIN { n = split(req, R, "|"); for (i = 1; i <= n; i++) seen[R[i]] = 0 }
  /^## / { for (i = 1; i <= n; i++) if (index($0, R[i]) == 1) seen[R[i]] = 1 }
  END {
    missing = ""
    for (i = 1; i <= n; i++) if (!seen[R[i]]) missing = missing (missing ? ", " : "") R[i]
    if (missing != "") {
      printf "design-lint: missing sections: %s\n", missing > "/dev/stderr"
      exit 2
    }
    printf "design-lint: %d required sections present — structure OK.\n", n
  }
' "$DESIGN"
