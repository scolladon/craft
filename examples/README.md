# craft examples — a runnable sample per injection point

> New to customizing craft? Read **[docs/guides/customizing.md](../docs/guides/customizing.md)** first —
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
| 12 | **DoD artifact** | [`dod-artifact/`](dod-artifact/) | 1 |
| 13 | **derived-plugin extension surface** | [`derived-plugin/`](derived-plugin/) | 2 |
| — | **named tracker adapter** (`extends.backlog-adapters`) | [`backlog-github-issues/`](backlog-github-issues/) | 2 |
| — | **named config** (`craft:init` → `craft:run --config <name>`) | [`named-config/`](named-config/) | 0 |
| — | **policy** — headless auto-merge (`policy:`) | [`policy-headless-merge/`](policy-headless-merge/) | 0 |
| — | **intention** corpus (`intention:`) | [`intention-corpus/`](intention-corpus/) | 0 |
| — | **memory** cache (`memory:`) | [`memory-cache/`](memory-cache/) | 0 |
| — | **required** — pin a phase (`phases.<id>.required`) | [`phase-required/`](phase-required/) | 0 |
| — | **reorder** phases (`pipeline.reorder`) | [`pipeline-reorder/`](pipeline-reorder/) | 0 |
| — | **hygiene gate** (`hygiene.gate`) | [`hygiene-gate/`](hygiene-gate/) | 0 |

Tier 2 ships: the `extends:` registration surface is proven end-to-end (engine S7 fixture green).
[`derived-plugin/`](derived-plugin/) shows a manifest registering a new phase, an agent, and a
profile via a derived plugin. [`backlog-github-issues/`](backlog-github-issues/) shows a named
backlog adapter registered via `extends.backlog-adapters`. See
[docs/guides/customizing.md §3 Tier 2](../docs/guides/customizing.md) for the full how-to.

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
- Unlike the Superpowers peer row, a **methodology** can also land as a catalog example rather than
  stay a peer: [`deliberation-review/`](deliberation-review/) swaps the review phase's `role:` (#10)
  to a multi-round deliberation topology and narrows `harness.dimensions` (#6) to one costly lens —
  opt-in, ~2× cost for depth, not a default. It wires the same two points every swap uses; no new
  injection point.

## A use-pattern: running craft in a loop

The loop composes a Claude Code primitive (`/loop`) over an existing craft entry point
(`/craft:run`). It injects nothing into craft — no manifest key, no injection point — and therefore
does not appear in the injection-point table above. The recipe covers the interactive form (Claude
Code `/loop` self-paced on the run record) and the headless form (`craft-pi` exit-code driven under a
DoD-presence precondition). See [`loop/`](loop/) for the operator instructions and DoD-driven exit
condition.

## A note on the sample context/override files

Samples that reference a `context:` or `override:` body keep those files under
[`.claude/workflow/`](.claude/workflow/) so each manifest passes `manifest-lint` as-is (the linter
resolves a manifest's relative file refs against its grandparent dir — here, `examples/`). In *your*
repo those files sit at your project root's `.claude/workflow/`.

The point: craft stays opinion-free about *what* you inject — it owns only the orchestration
guarantees (the invariant core, [GUIDE §2](../docs/guides/customizing.md)). Bring your own rules,
agents, and tools; craft wires and gates them.
