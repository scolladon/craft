---
# Injection point #9 (PRD §7): phases.<id>.override — replace a phase's procedure BODY with your
# own file. The non-overridable Preamble (the invariant contract) still binds; you own only the
# overridable Procedure half. Here the validation phase runs a project-shaped mutation procedure.
phases:
  validation:
    override: .claude/workflow/mut.md
---

# Example — overriding a phase's procedure (`phases.<id>.override`)

Every craft phase skill is two halves: a **non-overridable Preamble** (the engine-owned invariant
contract — what binds the phase) and an **overridable Procedure** (the steps that carry it out).
`override:` swaps *only the Procedure half* for a file you supply. Here the **validation** phase
runs `mut.md` — a project-shaped mutation-testing procedure — instead of the default.

| | default `validation` | with this override |
|---|---|---|
| Preamble (contract: gate before commit, blocker protocol, run record) | engine-owned | **unchanged — still injected** |
| Procedure (the mutation steps) | craft default | **your `mut.md`** |

## You own the body; the contract still binds (G5)

This is the same G5 guarantee as a `role:`/`procedure:` swap, one level down: a swap changes *who*
runs the phase; an override changes *the steps* — neither can drop the contract. The engine
assembles the invariant Preamble from the phase **descriptor** (keyed on the phase `id`, which the
override never touches) and prepends it. So your `mut.md` can reshape *how* mutation runs, but it
runs inside the engine's *never-commit-on-red / adapter-failure-is-a-blocker / record-everything*
frame.

`override:` is file-checked at lint time — a missing override file fails the manifest loudly
(`manifest-lint` → exit 2), never runs on a silently-absent body.

> In your real repo this file lives at the project root as `.claude/workflow.md`, and the override
> body lives at `.claude/workflow/mut.md`.
