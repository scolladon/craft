# 094 — `craft-pi` ships its own committed manifest and resolves gates by substitution

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P17-pi-adapter-productization.md · **Supersedes/Refines:** refines ADR-093; supersedes the old DC-8 ("gate-command execution when the resolved gate is a placeholder")

## Context

The full 11-phase walk (ADR-093) has two code-producing phases (implementation, refactoring) that must
never commit on a red gate. The engine returns gate strings as literal placeholders (`<gates.phase>`,
`<validation gate>`) **even when a manifest is supplied** — pinned in the design: the placeholder→command
substitution is the orchestrator's job, which the Claude `implementation` skill already does. So the bin
must (a) obtain a manifest whose `gates` map supplies the real commands, and (b) replicate that
substitution. ADR-093 already requires "a committed manifest that ships with the adapter."

## Options considered

- **Manifest home (DC-MAN):** (a) ship a fixture under `adapters/pi/`, resolved by a module-relative
  absolute path *(chosen)*; (b) honour the launch-cwd `.claude/workflow.md` of whatever repo the bin is
  run in; (c) inject a synthetic temp manifest per run.
- **Gate mechanics (DC-G, supersedes DC-8):** (a) substitute from the committed manifest, run the
  resolved command authoritatively via `execFile` before each code-producing commit, and treat an
  **empty** resolved gate on a code-producing phase as a **blocker** *(chosen)*; (b) trust pi's in-phase
  gate only (advisory); (c) gate only `implementation`, leave `refactoring` ungated.

## Decision

`craft-pi` **ships its own committed manifest** at `adapters/pi/.claude/workflow.md`, resolved by an
absolute path relative to the bin's own module location (the `engine.js` `REPO_ROOT` idiom), so it loads
regardless of launch cwd. The manifest carries a `gates` map only — **no provider/model pin** (DC-3
passthrough preserved). The bin substitutes `<gates.phase>`/`<validation gate>` from that map and runs
the resolved command authoritatively before each code-producing commit; an empty resolved gate on a
code-producing phase is a hard blocker (refuse to commit gateless). The manifest path is threaded into
`resolvePipeline`/`assembleBlock` via the optional args the engine bins already accept (the only edit to
the reused `engine.js`); the zero-arg call paths stay unchanged (preserves R-no-sc1 / ADR-086).

## Consequences

- `craft-pi` is **self-contained**: it carries its own gates and behaves identically wherever launched —
  the right shape for a portability *example*. It thereby assumes a target whose phase gate is the
  command the shipped manifest declares (e.g. `node --test`).
- Honouring a *target repo's* manifest (DC-MAN b) is a deliberate future extension, not built now.
- A CI/unit test asserts the committed manifest is lint-clean (`validateManifest`) and resolves a
  non-empty `gates.phase`, since the bin does not re-lint at runtime.
- The never-commit-on-red invariant holds across every code-producing phase by construction; the old
  DC-8 "advisory-only" path (which could let a construction phase commit with no authoritative gate) is
  closed.
