# forge-spike — pinned Claude Code mechanics (2026-06-12, claude CLI 2.1.175)

Throwaway spike for the `forge` plugin design (see `../workflow-promotion-design.md`,
Migration step 0). Method: headless `claude -p --plugin-dir <this dir>` runs with
instrumented hooks logging their received input to `/tmp/forge-spike/hooks.log`.
`ANTHROPIC_API_KEY` must be unset for child runs (it shadows OAuth and fails on a
zero-credit account).

## Results

| # | Question | Verdict | Evidence |
|---|---|---|---|
| a | Do plugin hooks fire for SUBAGENT tool calls? | **CONFIRMED** | Both plugin PreToolUse(Bash) hooks logged the subagent's `echo` command (same session id); marker executed inside the subagent's call |
| b | How do two `updatedInput` PreToolUse hooks compose? | **SAME-SNAPSHOT, LAST-WRITER-WINS** | Hook B received the ORIGINAL command, not A's rewrite; only B's marker executed. Cross-source: with user-level rtk-rewrite active, both plugin hooks saw the original, rtk's rewrite executed, plugin marker DISCARDED → merged order runs user-settings hooks after plugin hooks; no chaining, no merge |
| b' | Does a hook DENY beat a concurrent `updatedInput`? | **CONFIRMED** | Deny variant blocked `git status` with its exact corrective message while rtk (updatedInput) was active on the same call |
| c | Does a per-invocation `model` param override agent-def frontmatter? | **CONFIRMED** | `forge-spike:echo` (frontmatter `model: haiku`): bare spawn ran haiku, spawn with `model: 'sonnet'` ran sonnet-4-6 — verified in transcript JSONL, not just self-report |
| d | Plugin skill invocation surface + arguments | **CONFIRMED** | `/forge-spike:run hello 24.9k extra words` → skill fired, `$ARGUMENTS` = full string verbatim |

## Design consequences (applied to workflow-promotion-design.md)

1. **Drop the belt-and-braces agent-def lines** — hook inheritance is confirmed; the
   mechanical layer reaches subagents.
2. **The forge git-mangler guard uses DENY-with-corrective-message, not `updatedInput`**
   — rewriting cannot compose with rtk (or any other Bash-rewriting hook): same
   snapshot, last writer wins, and the winner depends on source ordering (user-after-
   plugin observed on 2.1.175, not contractual). Deny is order-independent and
   deterministic: one corrected retry instead of silent clobber.
3. **`models:` manifest override is implementable** as the per-invocation param; agent
   frontmatter is the default, the param takes precedence.
4. **Entry point confirmed**: `/forge:run <args>` with `$ARGUMENTS`.

Headless side-observation: `-p` main loops defaulted to opus-4-8 regardless of the
interactive session's model — irrelevant to the design but worth knowing for CI use.
