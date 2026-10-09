#!/usr/bin/env bash
# Static lints run by scripts/ci.sh. One command per line: errexit ignores a failure in
# every command of an && list except the last, which is how a red lint once exited 0.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

shellcheck scripts/*.sh hooks/*.sh
node engine/bin/pipeline-lint.js pipeline/default.yml
node engine/bin/pipeline-resolve.js pipeline/default.yml
node engine/bin/contracts-lint.js contracts
for b in BACKLOG.md templates/backlog.md; do bash scripts/backlog-lint.sh "$b"; done
for d in templates/design.md docs/contributing/design/*.md; do bash scripts/design-lint.sh "$d"; done
bash scripts/docs-structure-lint.sh docs/contributing
bash scripts/docs-structure-lint.sh docs/guides
bash scripts/docs-structure-lint.sh --audience docs
bash scripts/sync-adapter-agents.sh --check
