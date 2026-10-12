---
subjects:
  - adapters/codex/src/hook-trust.js
  - adapters/codex/test/hook-trust.test.js
supersedes:
  - adr: "514"
    scope: "the quoted operand is trusted unless it holds a double quote, backslash, backtick or $("
---
# 517 — The quoted guard operand is an allow-list

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/codex-hooks-quote-plugin-root.md · **Supersedes/Refines:** supersedes ADR-514, refines ADR-515

## Context

Review proved ADR-514's deny-list incomplete. Inside double quotes, nested parameter expansion can assemble a literal `$(` and evaluate it with no `$(` in the source text: `node "${y:=a[${z:-$}(touch M)]}$[y]…/craft-guard.js"` under bash and sh (recursive arithmetic subscript; `${a[y]}`, `${y:y}`, `${!y}` likewise) and `node "${(e)${:-${:-$}(touch M)}}…"` under zsh. `selectCraftHook` trusted both and the marker was created. Review also showed `X=/node "<…tail>"` passing as the interpreter (every shell reads it as an assignment and runs the operand itself), and fuzzing found zsh's `EQUALS` expansion turning a bare `=x/…/craft-guard.js` into a failing command lookup.

## Options considered

1. **Allow-list: path characters, plain spaces and the exact plugin-root shim only** *(recommended)* — pros: no `$` other than the shim reaches the shell, so no shell expansion inside the quotes can execute; smallest grammar to verify / cons: `"$HOME/…"` is no longer trusted (never documented)
2. **Allow-list plus bare-identifier `$NAME` (not followed by `:` or `[`) and `${NAME}`** — pros: keeps `"$HOME/…"` / cons: more grammar per shell to keep differential-free; no registration needs it
3. **Extend the deny-list** — pros: smallest diff / cons: the bypass class is open-ended; it already failed once

## Decision

The user ratified option 1. Quoted contents, split on the exact `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}` shim, must be path characters (`[\p{L}\p{N}._/+@%,:=-]`) and plain spaces only. A `NAME=` assignment, a `=`-led word (zsh command lookup) and a relative interpreter (it resolves against the repository being worked on) are therefore all refused. The interpreter is exactly `node` (a PATH lookup) or an absolute path ending in `/node`, and the operand value, quoted or bare, starts with `/` or with the exact shim followed by `/` (the shim expands to nothing when no root is set): a cycle-2 review proved `node "--eval=…//<tail>"` and `node --import=data:…//<tail>` trusted, because node reads a `-`-led operand as its own option and the tail becomes a JS comment, and a relative operand resolves against the session directory, the repository being worked on.

Superseded from ADR-514: the deny-list of `"`, `\`, backtick and `$(` as the quoted-content rule.

Carried forward from ADR-514: the command is one interpreter word, then exactly one operand, bare or in one pair of double quotes; the operand value must end with the guard tail; anything after the operand refuses the hook; a codex that strips the quotes while expanding a spaced root is refused loudly.

## Consequences

A differential fuzz (300 000 generated commands; every accepted one run under sh, bash, zsh and dash with a stub `node`) found 0 differentials with an unspaced root; a re-run with option fragments and an oracle requiring node's argv to be a rooted path (400 000 generated) also found 0. With a spaced root the only residual is the legacy unquoted shim splitting, which stays accepted so untouched installs keep `trust-hook --check` green. Each bypass witness is pinned as a refusal.
