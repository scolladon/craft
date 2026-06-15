---
# A capability toolkit (everything-claude-style: agents/commands/hooks/rules) slotted into
# forge across FIVE injection points. forge orchestrates the pieces; it does not replace them.
# Surfaces tagged (current) work today; (PRD) land in the customizable-engine program.

context: .claude/workflow/house-rules.md          # toolkit "rules" → global context        (current, §7 #8)
gates:
  phase: "npm run validate"                        # toolkit validate script → phase gate     (current, §7 #3)
phases:
  plan:   { role: my-toolkit:planner }             # swap in the toolkit's planner agent       (PRD,    §7 #10)
  review: { context: .claude/workflow/sec-rules.md } # toolkit security rules into review only (current, §7 #8)
pipeline:                                           #                                           (PRD,    §7 #11)
  insert:
    - after: implement
      phase:
        id: license-scan
        procedure: my-toolkit:license-check        # a toolkit command becomes a real phase
        execution: inline
        gate: "npx license-checker --production"
models: { reviewer: opus }                          # toolkit-driven model routing              (current, §7 #2)
---

# everything-claude toolkit + forge

A toolkit is a *bag of parts*. forge gives each part a home and a guarantee:

| Toolkit artifact | forge injection point | Note |
|---|---|---|
| rule files (`house-rules.md`, `sec-rules.md`) | `context:` (global / per-phase) | injected verbatim into agents |
| a custom planner agent (`my-toolkit:planner`) | `role:` swap on the `plan` phase | the engine still injects the forge contract *around* it (PRD §6.3) |
| a command/skill (`my-toolkit:license-check`) | an **inserted** phase | gets gate discipline + run-record like any phase |
| a validate script | `gates.phase` | run verbatim at the phase boundary |
| hooks | repo `.claude/hooks` | mechanical, automatic — not even in this manifest |

The swapped planner is shown in `agents/planner.md`. Because a plugin cannot read another
plugin's files (SP2, SPIKE.md), a toolkit shipped as its *own* plugin contributes the agent
by **namespaced name** (`my-toolkit:planner`) and this manifest does the wiring — content in
the plugin, configuration in the repo.
