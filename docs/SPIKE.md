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

---

# SP2 — cross-plugin extension/dispatch (customizable-engine PRD; CLI 2.1.177)

Can a repo's OWN local plugin EXTEND forge — i.e. forge's `/forge:run` orchestrator
discover and dispatch to a phase skill + role agent defined in a *different* plugin? Gates
G8 / Tier-2 / P14 / P16. See `docs/PRD-customizable-engine.md` §6.5.

## Phase A — documentation grounding (DONE)

**Verdict: largely GREEN — cross-plugin composition is officially supported.**

| Question | Verdict | Detail |
|---|---|---|
| Multiple plugins active at once | **SUPPORTED** | namespaced: `pluginA:skill`, `pluginB:agent`; subfolder agents `plugin:dir:agent` |
| Agent registry across plugins | **SUPPORTED** | global — all enabled plugins' agents in one registry; orchestrator can spawn another plugin's agent |
| Skill→skill across plugins | **SUPPORTED (docs imply)** | Skill tool invokes namespaced `pluginB:phase` — but no explicit cross-plugin example → Phase B |
| `${CLAUDE_PLUGIN_ROOT}` scoping | **SUPPORTED** | per-plugin — resolves to the owning plugin's own root even with others loaded |
| Plugin dependencies / extension | **SUPPORTED** | `plugin.json` `dependencies: ["forge"]`, semver, auto-install; cross-marketplace needs `allowCrossMarketplaceDependenciesOn` allowlist |
| One marketplace, many plugins + local coexist | **SUPPORTED** | `--plugin-dir` coexists with installed; local wins on name clash |

**Hard constraints (documented):**
- **No cross-plugin file access** — a plugin cannot read another plugin's files (`../`
  traversal fails post-install); only same-marketplace **symlinks** are dereferenced/copied.
  **No `${PLUGIN_B_ROOT}` variable.**
- Cross-marketplace deps require an allowlist; cache paths change on update.

**Design implication (provisional — folds into PRD §6.5 / Tier-2):**
- The extension surface **rides on native `dependencies` + namespacing**, not a bespoke
  `forge.extends` mechanism. Derived plugin B: `dependencies: ["forge"]`, ships
  `pluginB:my-phase` skill + `pluginB:my-agent`.
- Because forge (plugin A) **cannot read plugin B's files**, the phase **descriptor wiring**
  (execution, gate, consumes/produces, role) lives in the **repo manifest** (`.claude/workflow.md`,
  which forge already reads); plugin B ships only the *skill/agent content*, invoked **by
  namespaced name**. This cleanly sidesteps the file-access constraint.

**Undocumented → Phase B (empirical, `claude -p --plugin-dir a --plugin-dir b`):**
1. Skill in plugin A invokes a skill in plugin B via the Skill tool (runtime confirm).
2. Does the `Agent(name)` tool-allowlist accept **scoped** names (`Agent(pluginB:agent)`)?
3. What context/skills does a cross-plugin-spawned subagent inherit (forge's, or only B's)?
4. Same-marketplace symlink for a shared script resolves at runtime; `/reload-plugins` picks up cross-plugin changes.
