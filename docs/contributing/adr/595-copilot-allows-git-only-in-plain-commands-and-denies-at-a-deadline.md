---
subjects:
  - adapters/copilot/hooks/craft-guard.js
  - adapters/copilot/src/git-guard-adapter.js
  - engine/src/guards/git-plain-command-gate.js
supersedes: []
---
# 595 — Copilot allows git only in plain commands and denies at a deadline

- **Status:** superseded by ADR-606
- **Date:** 2026-10-16
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md · **Supersedes/Refines:** refines ADR-578, ADR-594

> **Superseded by ADR-606** for the commit idiom: the gate no longer recognises it, because macOS `/bin/bash` 3.2
> ends the `$(…)` at a `)` in the body and runs the rest as shell; the rest of this decision stands.

## Context

Review cycle 2 verified six new bypass classes after the fail-closed tokeniser landed, each a
bash construct still not modelled: extglob (`@(git) push`), `$[1<<2]` swallowing the next line as
a heredoc, `export GIT_CONFIG_*` before git, `GIT push` on a case-insensitive filesystem, a dynamic
shell option or evaluator given a literal string (`C=-c; bash $C 'git push'`), and a brace word
holding an expansion (`{$(:),git,push}`). It also verified a new quadratic path (`git -c git -c …`)
that kept the real hook past copilot's ~30 s timeout, which fails open. A deny-list over bash
grammar keeps losing to the next unmodelled construct, and every quadratic path is a fail-open.

## Options considered

1. **Allowlist plus deadline** *(recommended)* — pros: closes the classes found and the next ones
   by construction; removes the timing fail-open whatever the parser costs / cons: more false
   blocks on non-plain commands that mention git, on copilot only.
2. **Deadline plus patching the six classes** — cons: more exotic bypasses expected.
3. **Ship as defence-in-depth** — cons: known bypasses shipped.

## Decision

**Ratified by the user.** Option 1, on the copilot binding only:

- **Deadline.** The hook computes its verdict in a worker thread. The main thread writes the JSON
  deny and exits when no verdict has arrived by a fixed deadline well under copilot's ~30 s hook
  timeout. A slow or hung parse therefore denies instead of failing open.
- **Plain-command gate.** When the raw command matches `git` case-insensitively anywhere, it must be
  plain or it is denied with a fixed reason ("too complex to verify near git — spell it plainly"):
  outside quotes only letters, digits, space, tab and `_ . / : = @ % + , ~ ^ -`, the separators
  `;` `&&` `||` `|` `&` and newline, and `>`/`>>`/`2>&1`-style redirects to a literal target;
  single-quoted text is data; double-quoted text excludes `$`, backtick, `\` and `!`; no word in
  command position (the first word of a command, after any separator) is an evaluator or wrapper (`sh bash zsh dash ksh eval env exec command nohup time sudo nice timeout
  xargs source .`); and no `GIT_CONFIG_` text appears. Craft's commit idiom
  `"$(cat <<'DELIM' … DELIM)"` is recognised exactly and its body treated as data.
- A plain command is then judged by the destructive predicate and `toolCallGuard` as before. The git
  word match becomes case-insensitive.
- The ext-diff predicate shared by every binding keeps its current rules: it protects parsed
  output, not a sandbox boundary, so exotic bypasses there are documented, while its quadratic
  paths are made linear because a slow predicate stalls every binding's tool calls.

## Consequences

On copilot, any non-plain command that mentions git is denied with one re-issue as the remedy;
craft's routine git and commit idiom stay plain. The deadline and the gate are pinned by hook
process tests and gate tests; the residual list keeps the channels no string guard can see.
