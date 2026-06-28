#!/bin/bash
# craft — validate a backlog file against the backlog structure (templates/backlog.md).
# Checks that required section headings are present.
#
# Usage: backlog-lint.sh <backlog-file>
set -euo pipefail

BACKLOG="${1:?usage: backlog-lint.sh <backlog-file>}"
[ -f "$BACKLOG" ] || { echo "backlog-lint: no such file: $BACKLOG" >&2; exit 2; }

REQUIRED="## Status at a glance|## Done|## Next|## Then|## Deferred / parked|## Notes"

awk -v req="$REQUIRED" '
  BEGIN { n = split(req, R, "|"); for (i = 1; i <= n; i++) seen[R[i]] = 0 }
  /^## / { for (i = 1; i <= n; i++) if (index($0, R[i]) == 1) seen[R[i]] = 1 }
  END {
    missing = ""
    for (i = 1; i <= n; i++) if (!seen[R[i]]) missing = missing (missing ? ", " : "") R[i]
    if (missing != "") {
      printf "backlog-lint: missing sections: %s\n", missing > "/dev/stderr"
      exit 2
    }
    printf "backlog-lint: %d required sections present — structure OK.\n", n
  }
' "$BACKLOG"
