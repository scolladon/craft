---
# Injection point #10 (PRD §7): `phases.<id>.role` — swap WHICH agent runs a phase.
# The engine assembles and injects the P5 contract around YOUR agent (G5), so the swapped
# worker can't drop the invariant core. Here the highest-stakes phase — the code producer —
# is handed to an external agent. All-current: the swap + contract injection work on craft today.
phases:
  implementation:
    role: acme:tdd-specialist
---

# Example — swapping a phase's agent (`role:`)

`role:` on a phase points it at **your** agent instead of the craft default. The engine still
assembles the invariant contract from the phase's *descriptor* and injects it around the swapped
worker — so a swap changes *who* runs the phase, never *what binds it* (**G5**). This example takes
the most demanding case: `implementation`, the code producer, handed to an external
`acme:tdd-specialist` the local repo does not define.

| | default | swapped here |
|---|---|---|
| `implementation` runs | `craft:slice-implementer` | `acme:tdd-specialist` |
| injected contract | the `construction` bundle + core | **unchanged** — assembled from the descriptor `id`, which the swap leaves alone |

## Contract survives the swap (G5)

The injected block (the engine's `contract-assemble` step) is keyed on the phase **`id`**, which a
`role:` swap never changes. So whoever runs `implementation` — craft's default or
`acme:tdd-specialist` — runs inside the *same* engine-owned contract: RED→GREEN→REFACTOR, gate before
commit, no suppression, no swallowed errors. A swapped agent can't quietly relax the rules; it can
only do the work under them.

## Agent vs. inline for an external role

Under the default `agent` execution the swapped role is spawned as a subagent with the contract
**prepended** to its prompt. Under `inline` execution the phase runs in the session's own thread: a
swap to a **local** agent (`agents/<name>.md`) also loads that agent's craft, but an **external** ref
like `acme:tdd-specialist` has no local body, so it runs on the **injected contract block alone** —
contract-only, by design. That is deliberate fidelity, not a gap: the invariants still bind; only the
role's extra craft is absent inline.

## A swapped role must resolve — fail closed

A `role:` that doesn't resolve to an installed agent is a typo, not a feature. The resolver's
role-existence guard makes a swap to an unknown role fail closed (`pipeline-resolve` → `ok: false`)
rather than degrade silently. So `acme:tdd-specialist` is valid only when that plugin is installed;
a misspelling is caught, not run on the contract alone. (The engine guard ships now; verifying that
an *external* ref is installed — "what counts as installed" across plugins — is the registration
surface a later phase wires, so today the live probe is permissive.)

## The skill axis — `procedure:`

`role:` swaps the *worker*; `procedure:` swaps the *orchestrating skill* for a default phase — same
mechanism, same G5 guarantee (the `id`-keyed contract is unchanged), dispatched verbatim:

```yaml
phases:
  planning:
    procedure: acme:my-planner   # run a different skill for this phase; contract still injected
```

A `procedure:` that resolves to no installed skill STOPs loudly via the same "resolves to no
installed skill" guard. Swap the agent, the skill, or both — the engine wires and gates whatever you
bring.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
