# Next elected item

**Compose the destructive-git predicate into the codex hook.** This is the top entry of BACKLOG.md under
"Open (scoped 2026-10-16 — follow-ups surfaced by the copilot-git-argv-normalising-guard run)".

Why this one:
- It is the top of the newest Open section, so it is next in top-down order.
- It is unblocked: no paid eval, no interactive TUI, and no dependency on the driver spike.
- It is a real guard gap. Disclosed bypasses such as `git -C . push` reach a destructive verb.

Its sibling entries come after it:
- The ext-diff hook gaps: a rewrite under the ADR-533…541 crash contract, which is its own change.
- The copilot fuzz arm and the fuzz-at-scale classification: test-hardening.
- The bash 3.2 heredoc and `write_bash` entries: docs and probes.

## Ready-to-paste prompt

```
/craft:run --policy push=always --policy propose=always --policy integrate=always --policy teardown=always Compose the destructive-git predicate into the codex hook.

Backlog entry (BACKLOG.md, "Open (scoped 2026-10-16 — follow-ups surfaced by the copilot-git-argv-normalising-guard run)"):
> `adapters/codex/src/execpolicy-rules.js` discloses that `git -C . push` and `--git-dir=… push` bypass its
> `.rules` prefix match. The copilot binding now judges normalised argv with `gitDestructivePredicate`; the
> codex guard hook does not compose it (ADR-579 scoped it to copilot). Proof to run first: feed
> `adapters/codex/hooks/craft-guard.js` a `git -C . push origin main` payload and confirm it exits 0
> (allows). Then decide whether codex also takes the plain-command gate.

Context for a cold session:
- Proof first. The codex PreToolUse payload is Claude-shaped (`tool_input.command`), not the internal
  `exec_command`/`cmd`. Dump the real hook payload shape before trusting a unit fixture, then pipe a
  `git -C . push origin main` payload into the hook and record the exit code and stdout.
- Prior art lives in the copilot binding: `engine/src/guards/` (shell-tokeniser, shell-git-invocations,
  git-plain-command-gate, the destructive-git predicate) and ADRs 578–596. ADR-579 says "the predicate is
  composed by copilot only". Composing it into codex SUPERSEDES that scope, so the decisions phase owes a
  supersession ADR: `supersedes:` frontmatter, both body anchors, a DECISION-REVERSAL line and a citation
  sweep.
- Genuine decision fork for the user: does codex also take the plain-command gate (allowlist posture,
  ADR-595/596) or only the destructive-git predicate? Ask with AskUserQuestion during decisions.
- Codex live proof runs in a throwaway CODEX_HOME with auth copied in. Prove isolation with an mtime
  find, not an ls -la fingerprint. A binding is done only after a live end-to-end run.
- Stryker mutates `adapters/codex/src/*` files that are listed explicitly in `engine/stryker.conf.json`.
  A new codex src file must be added there. Pass per-hunk scope as ONE comma-separated --mutate.
- Differential-fuzz any hand-rolled parser path at review cycle 1. Review alone finds one gap per cycle.
- Gate: `bash scripts/ci.sh`. Etiquette: no AI/session traces in commits, PR or trailers. Scripted
  git diff/show must pass --no-ext-diff. README counts move with new design/plan/ADR docs in the same commit.
```
