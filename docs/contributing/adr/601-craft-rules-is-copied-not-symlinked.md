---
subjects:
  - adapters/codex/README.md
  - adapters/codex/craft.rules
---
# 601 — `craft.rules` is deployed by copy, never by a file symlink

- **Status:** accepted
- **Date:** 2026-10-16
- **Design:** docs/contributing/design/codex-rules-deploy-step.md · **Supersedes/Refines:** refines ADR-599

## Context

No README step deploys `adapters/codex/craft.rules` to `$CODEX_HOME/rules/`, so the execpolicy layer
is absent on every documented install. ADR-599 left the deploy step two ways to own verification: a
post-copy check, or a symlink to the committed file. On codex 0.162.1 a symlinked `craft.rules` in
`$CODEX_HOME/rules/` is not loaded (a malformed target does not stop `codex exec`; 3/3 by the designer,
2/2 re-run by the orchestrator), while a copied malformed file stops it at startup. `cmp` and
`codex execpolicy check` both follow the link and pass, so a symlinked file leaves the layer void with
no signal.

## Options considered

1. **Copy the file, then verify the copy** — pros: the loaded path, measured / cons: goes stale when
   the rule body changes, so the step must say to re-run it. *(designer's recommendation)*
2. **Symlink the file to the committed `craft.rules`** — pros: never stale / cons: not loaded on
   0.162.1, and every file-level check passes on it.
3. **Symlink the whole `$CODEX_HOME/rules` directory** — pros: followed by codex / cons: replaces the
   operator's own rules directory and loads any future `*.rules` file in the linked directory.

## Decision

Option 1, **adopted-as-recommended (no user judgment)**: the evidence rules out option 2 and option 3
needs a file move outside this change. The README deploys `craft.rules` with `cp` into
`$CODEX_HOME/rules/craft.rules` and says to copy, not symlink, citing the 0.162.1 observation.

## Consequences

- ADR-599's "or a symlink to the committed file" branch is closed: the deploy step owns a post-copy
  verification.
- A copy goes stale when `craft.rules` changes; the README tells the operator to re-run the copy and
  its verification then.
- Revisit if a later codex loads symlinked rules files, or if `craft.rules` moves into a rules-only
  directory that a directory symlink could point at safely.
