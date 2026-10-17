---
subjects:
  - engine/src/guards/git-plain-command-gate.js
  - adapters/copilot/README.md
  - docs/contributing/specs/gate.md
supersedes:
  - adr: "595"
    scope: "the commit idiom is recognised and its body treated as data"
---
# 606 — Copilot denies the heredoc commit idiom

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/bash32-heredoc-commit-idiom.md · **Supersedes/Refines:** supersedes ADR-595

## Context

ADR-595 let copilot's plain-command gate accept `"$(cat <<'DELIM' … DELIM)"` and treat its body as data. That holds in bash 5 and zsh, not in macOS `/bin/bash` 3.2, which copilot runs: a `)` in the body ends the substitution early and the rest runs as shell. Pinned: `git commit -q --allow-empty -m "$(cat <<'EOF'⏎x)"; git branch -D victim; echo "⏎EOF⏎)"` is allowed by `copilotGuard`, and `/bin/bash` 3.2 then deletes branch `victim`; plain `git branch -D victim` is denied; zsh keeps the branch. Not run live through copilot.

## Options considered

1. **Deny the idiom** *(recommended)* — pros: fails closed; removes the idiom-recognition code; one re-issue in the form ADR-605 teaches / cons: idiom commits on copilot cost one denied call.
2. **Keep accepting it; list the early close as a residual** — pros: smallest change / cons: a bypass of the destructive predicate stays open in a shape the gate allows by name.
3. **Accept only bash-3.2-safe bodies** (no `'`, `"`, backtick, `(`, `)`) — cons: the safe set must be pinned against bash 3.2's scanner, any gap fails open, and most real bodies are denied anyway.

## Decision

Ratified by the user: option 1. The gate no longer recognises the idiom; `"$(cat <<'EOF' …` is ordinary double-quoted text holding `$`, denied with the existing "too complex to verify near git — spell it plainly" reason. The gate cannot know which bash runs the command, so it denies a construct whose meaning depends on it (ADR-594's posture).

Superseded from ADR-595: the commit idiom is recognised exactly and its body treated as data.

Carried forward from ADR-595: everything else — the deadline, the plain-command allowlist, the evaluator and wrapper rules, the `GIT_CONFIG_` rule, and the predicates that judge a plain command.

## Consequences

On copilot an idiom commit is denied and re-issued as `git commit -m "…"` or `-F <file>`. The shared tokeniser and predicates keep modelling bash 5 and zsh, which parse the idiom correctly; on copilot the gate runs before them.
