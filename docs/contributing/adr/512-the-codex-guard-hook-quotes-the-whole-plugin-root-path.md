---
subjects:
  - adapters/codex/hooks.json
  - adapters/codex/config.template.toml
  - adapters/codex/README.md
---
# 512 — The codex guard hook quotes the whole plugin-root path

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/codex-hooks-quote-plugin-root.md · **Supersedes/Refines:** refines ADR-508

## Context

`adapters/codex/hooks.json` and `config.template.toml` register `node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js` unquoted. A live codex-cli 0.161.0 probe (offline fake provider, throwaway `CODEX_HOME`) showed codex runs a hook command as `<login shell> -c <command>`, the shell taken from the user database (`getpwuid_r`), with `$SHELL` ignored. From a root containing a space, zsh runs the guard (it does not word-split unquoted expansions); bash, sh and dash split the path and node fails to load the guard. So bash/sh login shells — the Linux default — lost the guard whenever the root had a space.

## Options considered

1. **Quote the whole path, as ADR-508 does for `hooks/hooks.json`, and widen the trust matcher to accept it** *(recommended)* — pros: runs under every shell; one shim spelling across the repo / cons: the hook hash changes, so an existing trusted install reports `modified` until `trust-hook` runs once
2. **Keep the unquoted form and document "no whitespace in the root" for bash/sh login shells** — pros: no code change / cons: leaves a silent loss of the guard on a supported shell
3. **Close the entry with no change** — pros: none beyond zero work / cons: the defect stays

## Decision

Both registrations spell the command `node "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js"`: the interpreter, then the whole guard path as one double-quoted operand. A hand-wired absolute root goes inside the quotes. The template keeps registering exactly the `hooks.json` command.

## Consequences

The trust matcher must accept the quoted operand (ADR-514), or `trust-hook` refuses the guard and the hook silently no-ops. An install that already trusted the unquoted command keeps working until the operator re-copies the template block; after that, one `trust-hook` run re-trusts it (`modified` maps to a write). A runtime test executes the registered command from a spaced root (ADR-516).
