---
subjects:
  - engine/src/guards/git-bash-verdict.js
  - adapters/codex/src/git-guard-adapter.js
  - adapters/copilot/src/git-guard-adapter.js
supersedes:
  - adr: "579"
    scope: "the destructive-git predicate is composed by copilot only"
---
# 640 — Codex and copilot share one git Bash verdict

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/codex-git-destructive-predicate-hook.md · **Supersedes/Refines:** supersedes ADR-579

## Context

The codex guard hook judges no destructive git. Fed the real codex-cli 0.162.1 PreToolUse payload
(`tool_name: "Bash"`, `tool_input.command`), `adapters/codex/hooks/craft-guard.js` exits 0 (allows)
for `git -C . push origin main`, `git --git-dir=.git push origin main`, plain `git push`,
`bash -lc 'git push'`, `git reset --hard`, `git clean -fd` and `git branch -D x`. The `.rules`
prefix layer forbids only unprefixed `git push|clean|reset`. `gitDestructivePredicate` denies all of
them. Copilot already composes the gate, parse, destructive and ext-diff verdicts in its adapter.

## Options considered

1. **One shared engine export** *(recommended)* — copilot's composition moves to
   `engine/src/guards/git-bash-verdict.js`; both adapters call it / pros: one sequence, no drift /
   cons: a new engine module in mutation scope.
2. **Compose locally in codex** — pros: engine untouched / cons: the same sequence in two adapters,
   which drift as the gate's rules change (ADR-606 changed them after shipping).
3. **Keep `.rules`-only** — cons: every bypass above stays shipped.

## Decision

**Ratified by the user.** Option 1. `engine/src/guards/git-bash-verdict.js` exports
`plainGitCommandVerdict(command)`; the codex and copilot adapters both judge a Bash call with it, and
the first block wins. `toolCallGuard` does not call it: pi, cursor, opencode and antigravity keep
their Bash path unchanged.

Superseded from ADR-579: the destructive-git predicate is composed by copilot only — codex now
composes it too, through the shared export.

Carried forward from ADR-579: `gitDestructivePredicate` stays a separate export that
`toolCallGuard` does not call, and bindings other than copilot and codex do not compose it.

## Consequences

The codex hook denies destructive git by exit 2 with the predicate's reason. Copilot's behaviour is
unchanged and pinned by its existing tests. The `.rules` disclosure stays true for the `.rules`
layer and now names the hook as the layer that denies the interposed-option forms.
