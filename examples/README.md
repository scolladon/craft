# forge examples — integrating external skill collections

forge sits at the **workflow-engine** layer. The popular Claude Code skill collections sit
*below* it and **feed** forge rather than compete with it (see PRD §15). Each kind of
artifact lands at a forge injection point (PRD §7):

| Collection kind | Example | Lands at | Status |
|---|---|---|---|
| **Rules / guidelines** | Karpathy-skills | `context:` (global or per-phase) — injected into every agent / inline run | current |
| **Capability toolkit** | everything-claude | `role:` swap · `gates:` · `pipeline.insert` · `context:` · repo `.claude/hooks` | mixed (see below) |
| **Methodology** | Superpowers | *same layer as forge* — a peer, not an input | — |

**Status legend:** *current* = works on forge today; *PRD* = lands in the customizable-engine
program (PRD §17). Each example labels its surfaces.

## Examples
- [`karpathy-as-context/`](karpathy-as-context/) — a behavioral-guideline pack consumed as
  a global `context:` file. *All-current.*
- [`everything-claude-toolkit/`](everything-claude-toolkit/) — a grab-bag toolkit slotted in
  across five injection points (agent swap, gate, inserted phase, per-phase context, hooks).

The point: forge stays opinion-free about *what* you inject — it owns only the orchestration
guarantees (PRD §11). Bring your own rules, agents, and tools; forge wires and gates them.
