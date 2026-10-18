---
subjects:
  - engine/src/claude-ext-diff-hook-main.js
supersedes: []
---
# 647 — The Claude ext-diff hook judges the ext-diff rule only

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/claude-ext-diff-hook-gaps.md · **Supersedes/Refines:** none

## Context

With the verdict delegated to the engine (ADR-646), the hook could call `gitExtDiffPredicate` (the
ext-diff rule over the shell parse) or `plainGitCommandVerdict` (the plain-command gate, destructive
git, then ext-diff; ADR-640). The backlog entry asks only for the ext-diff gaps.

## Options considered

1. **Ext-diff only** *(recommended)* — pros: today's scope; no new false blocks / cons: Claude gains no
   destructive-git deny from this hook
2. **Full `plainGitCommandVerdict`** — pros: one verdict across codex, copilot and Claude / cons: the
   plain-command gate denies git-mentioning commands holding `$`, `\"` or a wrapper, and the heredoc
   commit idiom (ADR-606), which Claude agents use routinely

## Decision

Adopted-as-recommended (no user judgment): option 1. The node verdict calls `gitExtDiffPredicate`,
which also carries the engine's config-channel and inline-alias denies.

## Consequences

Claude's destructive-git posture stays with its permission system. Composing the full verdict for
Claude is a separate decision that needs a measured Claude destructive-git gap first.
