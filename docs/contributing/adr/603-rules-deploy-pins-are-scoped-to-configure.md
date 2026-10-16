---
subjects:
  - adapters/codex/test/native-surface.test.js
---
# 603 — The rules deploy pins are scoped to the *Configure* section, plus a README-wide no-symlink pin

- **Status:** accepted
- **Date:** 2026-10-16
- **Design:** docs/contributing/design/codex-rules-deploy-step.md · **Supersedes/Refines:** none

## Context

The README honesty pins in `native-surface.test.js` match regexes over the whole file. A whole-file
pin on `$CODEX_HOME/rules` would pass on a mention in the *Guard* section with no copy step anywhere.
The README already teaches `ln -s` for skills, and a symlinked rules file is silently not loaded
(ADR-601). The suite already carries one negative pin (no bare `owner/repo` marketplace source).

## Options considered

1. **One whole-README regex on `CODEX_HOME/rules`** — pros: smallest / cons: any prose anywhere
   satisfies it.
2. **Pins sliced to the `## Configure` body** — the target directory, the `cp` line, the `cmp` line,
   "do not symlink" — pros: tied to the step / cons: none of them guards a symlink added elsewhere.
3. **Option 2 plus a README-wide negative pin: no `ln -s` into a `rules` directory** — pros: guards the
   one measured silent-void layout / cons: one more pin. *(designer's recommendation)*

## Decision

Option 3, **adopted-as-recommended (no user judgment)**: it follows the existing negative-pin
precedent. The *Configure* pins slice the README to that section and fail when the heading is
missing, so a renamed heading cannot pass on an empty match.

## Consequences

- Moving the deploy step out of `## Configure` turns the pins red by design.
- The negative pin leaves the skills `ln -s` line alone; it only refuses a `rules` target.
