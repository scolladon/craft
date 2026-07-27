---
# A capability toolkit (everything-claude-style: agents/commands/hooks/rules) slotted into
# craft across FIVE injection points. craft orchestrates the pieces; it does not replace them.
# All five surfaces work on craft today — every one is tagged (current).

context: .claude/workflow/house-rules.md          # toolkit "rules" → global context        (current, §7 #8)
gates:
  phase: "npm run validate"                        # toolkit validate script → phase gate     (current, §7 #3)
phases:
  plan:   { role: my-toolkit:planner }             # swap in the toolkit's planner agent       (current, §7 #10)
  review: { context: .claude/workflow/sec-rules.md } # toolkit security rules into review only (current, §7 #8)
pipeline:                                           #                                           (current, §7 #11)
  insert:
    - after: implementation
      id: license-scan
      procedure: my-toolkit:license-check          # a toolkit command becomes a real phase
      execution: inline
      gate: "npx license-checker --production"
models: { reviewer: opus }                          # toolkit-driven model routing              (current, §7 #2)
---

# everything-claude toolkit + craft

A toolkit is a *bag of parts*. craft gives each part a home and a guarantee:

| Toolkit artifact | craft injection point | Note |
|---|---|---|
| rule files (`house-rules.md`, `sec-rules.md`) | `context:` (global / per-phase) | injected verbatim into agents |
| a custom planner agent (`my-toolkit:planner`) | `role:` swap on the `plan` phase | the engine still injects the craft contract *around* it (PRD §6.3) |
| a command/skill (`my-toolkit:license-check`) | an **inserted** phase | gets gate discipline + run-record like any phase |
| a validate script | `gates.phase` | run verbatim at the phase boundary |
| hooks | repo `.claude/hooks` | mechanical, automatic — not even in this manifest |

The swapped planner is shown in `agents/planner.md`. Because a plugin cannot read another
plugin's files (SP2, docs/contributing/archive/SPIKE.md), a toolkit shipped as its *own* plugin contributes the agent
by **namespaced name** (`my-toolkit:planner`) and this manifest does the wiring — content in
the plugin, configuration in the repo.
