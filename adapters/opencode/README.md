# @craft/adapter-opencode

Install the craft workflow for opencode by copying this adapter's contents into a
target repo's `.opencode/` directory:

```
.opencode/
  agents/        # craft-<role>.md subagents (auto-discovered)
  commands/      # craft-<phase>.md dispatchers (auto-discovered)
  plugins/       # git-guard.ts (auto-discovered)
  src/           # pure JS the plugin imports (git-guard.ts → ../src/*.js) — REQUIRED
  opencode.json  # subagent_depth, permission, plugin, instructions
```

`src/` must be copied alongside `plugins/`: `plugins/git-guard.ts` imports
`../src/git-guard-adapter.js`, so omitting `src/` breaks plugin load.

`opencode.json` deliberately declares **no** `agent`/`command` maps — opencode
auto-discovers agents from `.opencode/agents/*.md` and commands from
`.opencode/commands/*.md`, and a JSON `command` entry without a `template` is rejected
by opencode's config schema.

> **Model providers.** The subagent `model:` pins default to Anthropic SKUs; override per
> agent (or via `opencode.json` `agent.<role>.model`) to run on any provider opencode
> supports. A craft `models.<role>` tier in `.claude/workflow.md` stays provider-neutral.
