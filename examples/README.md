# craft examples — a runnable sample per injection point

> New to customizing craft? Read **[docs/GUIDE-customizing.md](../docs/GUIDE-customizing.md)** first —
> the mental model + the full injection catalog. This directory is its example index: every Tier-0/1
> injection point (PRD §7) has a lint-clean sample `workflow.md` you can copy. The `examples-lint` CI
> gate keeps them all valid, so nothing here advertises a surface that no longer resolves.

Each sample's `workflow.md` is a real manifest (YAML frontmatter) + prose explaining the point. In a
real repo the file lives at your project root as `.claude/workflow.md`.

## By injection point

| # | Injection point | Example | Tier |
|---|---|---|---|
| 1 | **skip** a phase | [`skip-phase/`](skip-phase/) | 0 |
| 2 | **model** per agent | [`model-routing/`](model-routing/) | 0 |
| 3 | **gate** command | [`gate-command/`](gate-command/) | 0 |
| 4 / 5 | **execution** / **profile** | [`lean-profile/`](lean-profile/) | 0 |
| 6 | **harness config** | [`review-harness/`](review-harness/) | 0 |
| 7 | **backlog source** | [`backlog-custom/`](backlog-custom/) | 0 |
| 8 | **context file** (global / per-phase) | [`karpathy-as-context/`](karpathy-as-context/) | 1 |
| 9 | **override file** (procedure body) | [`override-procedure/`](override-procedure/) | 1 |
| 10 | **agent / skill swap** (`role:` / `procedure:`) | [`role-swap/`](role-swap/) | 1 |
| 11 | **insert** a phase | [`everything-claude-toolkit/`](everything-claude-toolkit/) | 1 |
| — | enable a default-off phase (`enabled: true`) | [`requirements/`](requirements/) · [`architecture/`](architecture/) | 0 |
| 12 | **derived-plugin extension surface** | *documented after P14* | 2 |

Tier 2 (a derived local plugin registering its own phases/agents) is real — cross-plugin dispatch is
spike-confirmed — but its how-to is intentionally held until P14 ships the surface, so the catalog
never advertises an unproven path (PRD §17).

## Integrating external skill collections

craft sits at the **workflow-engine** layer. The popular Claude Code skill collections sit *below* it
and **feed** craft rather than compete with it (PRD §15). Each kind of artifact lands at an injection
point:

| Collection kind | Example | Lands at |
|---|---|---|
| **Rules / guidelines** | Karpathy-skills | `context:` (global or per-phase) — injected into every agent / inline run |
| **Capability toolkit** | everything-claude | `role:` swap · `gates:` · `pipeline.insert` · `context:` · repo `.claude/hooks` |
| **Methodology** | Superpowers | *same layer as craft* — a peer, not an input |

- [`everything-claude-toolkit/`](everything-claude-toolkit/) slots a grab-bag toolkit into **five**
  injection points at once (agent swap, gate, inserted phase, per-phase context, model routing) —
  craft orchestrates the pieces; it does not replace them.
- [`role-swap/`](role-swap/) and [`override-procedure/`](override-procedure/) show the G5 guarantee:
  swap *who* runs a phase, or *the steps* it runs, and the engine still injects the invariant contract
  around your worker — a swap can't drop what binds the phase.

## A note on the sample context/override files

Samples that reference a `context:` or `override:` body keep those files under
[`.claude/workflow/`](.claude/workflow/) so each manifest passes `manifest-lint` as-is (the linter
resolves a manifest's relative file refs against its grandparent dir — here, `examples/`). In *your*
repo those files sit at your project root's `.claude/workflow/`.

The point: craft stays opinion-free about *what* you inject — it owns only the orchestration
guarantees (the invariant core, [GUIDE §2](../docs/GUIDE-customizing.md)). Bring your own rules,
agents, and tools; craft wires and gates them.
