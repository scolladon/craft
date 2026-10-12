---
subjects:
  - adapters/codex/src/hook-trust.js
  - adapters/codex/test/hook-trust.test.js
---
# 515 — The trust matcher refuses shell syntax in the interpreter and the bare operand

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/codex-hooks-quote-plugin-root.md · **Supersedes/Refines:** refines ADR-514

## Context

The matcher's comment claims anything chained, wrapped or flagged is refused, but whitespace-free shell syntax passes the two-token rule. Today `selectCraftHook` trusts `node $(touch${IFS}M)/…/craft-guard.js`, `` node `id`/… ``, `node ./evil.js${IFS}/…`, a glob variant, `node /nowhere;./evil/…/craft-guard.js` and `$(evil)/node /x/…/craft-guard.js` — each runs something other than the guard under `sh -c`. Anyone who can write the user's `config.toml` can also write `trusted_hash` directly, so this is the matcher's stated contract, not a new security boundary.

## Options considered

1. **Leave the gaps and file a backlog item** — pros: scope limited to quoting / cons: a second rewrite of the same function later
2. **Close both: the interpreter is a literal word, and the bare operand is exactly the shim plus the tail or a literal word** *(recommended)* — pros: the comment becomes true; one rewrite / cons: retires never-shipped spellings (bare `node $HOME/…`, placeholder-only quotes, an unbalanced quote), each refused loudly
3. **Close only the interpreter token** — pros: smaller / cons: leaves five of the six reproduced commands trusted

## Decision

Option 2. The interpreter token must be a literal word from the allow-list `[\p{L}\p{N}._/+@%,:=-]` with basename `node`. A bare operand must be exactly `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js` or a literal word from the same allow-list ending with the guard tail. Every other shape is refused with `no craft hook found`.

## Consequences

Both shapes ever shipped or observed — the raw unquoted shim and `/abs/.n/bin/node /abs/…/craft-guard.js` — still match, so untouched installs keep `trust-hook --check` green. The six reproduced commands become pinned refusals.
