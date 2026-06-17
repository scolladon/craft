# craft examples — integrating external skill collections

craft sits at the **workflow-engine** layer. The popular Claude Code skill collections sit
*below* it and **feed** craft rather than compete with it (see PRD §15). Each kind of
artifact lands at a craft injection point (PRD §7):

| Collection kind | Example | Lands at | Status |
|---|---|---|---|
| **Rules / guidelines** | Karpathy-skills | `context:` (global or per-phase) — injected into every agent / inline run | current |
| **Capability toolkit** | everything-claude | `role:` swap · `gates:` · `pipeline.insert` · `context:` · repo `.claude/hooks` | mixed (see below) |
| **Methodology** | Superpowers | *same layer as craft* — a peer, not an input | — |

**Status legend:** *current* = works on craft today; *PRD* = lands in the customizable-engine
program (PRD §17). Each example labels its surfaces.

## Examples
- [`karpathy-as-context/`](karpathy-as-context/) — a behavioral-guideline pack consumed as
  a global `context:` file. *All-current.*
- [`everything-claude-toolkit/`](everything-claude-toolkit/) — a grab-bag toolkit slotted in
  across five injection points (agent swap, gate, inserted phase, per-phase context, hooks).
- [`lean-profile/`](lean-profile/) — the `lean` execution topology: cheap phases run inline,
  the code-producer and harnesses stay `agent`; shows profiles are sugar over the per-phase
  `execution:` precedence. *All-current.*
- [`role-swap/`](role-swap/) — swap a phase's agent (`role:`) or its orchestrating skill
  (`procedure:`); the engine injects the invariant contract around your worker (G5), so a swap
  changes *who* runs a phase, never *what binds it*. *All-current* (the live install-probe for
  external refs rides a later phase).

The point: craft stays opinion-free about *what* you inject — it owns only the orchestration
guarantees (PRD §11). Bring your own rules, agents, and tools; craft wires and gates them.
