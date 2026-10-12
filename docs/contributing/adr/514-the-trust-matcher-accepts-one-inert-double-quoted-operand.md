---
subjects:
  - adapters/codex/src/hook-trust.js
  - adapters/codex/test/hook-trust.test.js
supersedes:
  - adr: "317"
    scope: "the command-identity check requires exactly two whitespace-separated tokens"
---
# 514 — The trust matcher accepts one inert double-quoted operand

- **Status:** superseded by ADR-517
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/codex-hooks-quote-plugin-root.md · **Supersedes/Refines:** supersedes ADR-317

> **Superseded by ADR-517** for the quoted-operand content rule: the deny-list of `"`, `\`, backtick and `$(`
> is replaced by an allow-list of path characters, plain spaces and the exact plugin-root shim.

## Context

`selectCraftHook` identifies craft's guard by splitting the command on whitespace, requiring exactly two tokens, a `node` interpreter, and an operand ending in `/adapters/codex/hooks/craft-guard.js`. The quoted registration (ADR-512) ends in `"` and is refused, so `trust-hook` would leave the guard untrusted — a silent no-op. Inside double quotes the shell still runs command substitution (`$(…)`, backticks) and re-parses backslash escapes; `$VAR` and `${…}` expand without splitting.

## Options considered

1. **Accept one double-quoted operand containing no `"`, `\`, backtick or `$(`** *(recommended)* — pros: accepts the shim, absolute, spaced and `$HOME` paths; refuses every form that executes inside the quotes / cons: none observed
2. **Accept any double-quoted operand without `"`** — pros: simplest / cons: trusts `node "$(evil)/…/craft-guard.js"`, which runs `evil`
3. **Accept only the exact shim plus the tail, or a literal path with no `$`** — pros: narrowest / cons: refuses `"$HOME/…"`, which the README invites, for no safety gain over option 1

## Decision

The user chose to widen the matcher rather than replace it; the operand rule is option 1, **adopted-as-recommended**. The command is parsed as one interpreter word, whitespace, then exactly one operand — bare, or wrapped in one pair of double quotes whose contents hold none of `"`, `\`, backtick, `$(`. The operand value must end with the guard tail. Anything after the operand refuses the hook.

Superseded from ADR-317: the identity check's shape of exactly two whitespace-separated tokens.

Carried forward from ADR-317: a `modified` hook re-trusts automatically; identity is still the operand's tail, never a canonical path; the four decoy commands and the `project`-source refusal stay pinned; both the raw and the shell-expanded echo must match.

## Consequences

The bare-operand path keeps today's rules unless ADR-515 narrows them. codex 0.161.0 `hooks/list` echoes the quoted command raw; a codex that strips the quotes while expanding a spaced root would be refused loudly (`no craft hook found`), never silently.
