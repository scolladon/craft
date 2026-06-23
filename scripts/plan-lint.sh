#!/bin/bash
# craft — validate a plan file against the part schema (templates/plan.md).
# The plan is the knowledge handoff: every part MUST carry its pre-chewed context
# block so part agents never rediscover. This gate makes that contract mechanical.
#
# Usage: plan-lint.sh <plan-file>
set -euo pipefail

PLAN="${1:?usage: plan-lint.sh <plan-file>}"
[ -f "$PLAN" ] || { echo "plan-lint: no such file: $PLAN" >&2; exit 2; }

REQUIRED="### Context|### TDD steps|### Gate|### Commit"

awk -v req="$REQUIRED" '
  BEGIN { n = split(req, R, "|"); parts = 0; bad = 0 }
  function flush(   i, missing) {
    if (part == "") return
    missing = ""
    for (i = 1; i <= n; i++) if (!seen[R[i]]) missing = missing (missing ? ", " : "") R[i]
    if (missing != "") { printf "plan-lint: part \"%s\" missing: %s\n", part, missing; bad++ }
    delete seen
  }
  /^## Part/ { flush(); part = $0; parts++; next }
  /^### /    { for (i = 1; i <= n; i++) if (index($0, R[i]) == 1) seen[R[i]] = 1 }
  END {
    flush()
    if (parts == 0) { print "plan-lint: no \"## Part\" sections found — not a craft plan."; exit 2 }
    if (bad > 0)    { printf "plan-lint: %d part(s) violate the schema. The plan phase cannot close.\n", bad; exit 2 }
    printf "plan-lint: %d part(s) OK — every part carries its context block.\n", parts
  }
' "$PLAN"
