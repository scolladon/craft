# Plan — <topic>

> Source: design doc `<path>` · ADRs `<numbers or none>`
> The plan is the implementation script AND the knowledge handoff. Slice agents start
> with zero context: whatever a slice block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every slice costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only slices: coverage/interop/property tests fold
  into the implementation slice whose code they exercise.
- A slice that would be a pure test pass over already-landed code merges into its
  neighbour.

## Slice 1 — <name>

### Context
<!-- Pre-chewed, exhaustive — the agent must NOT need to re-explore:
     exact file paths and symbol name-paths to touch; current signatures being
     changed; helpers/fixtures/describe blocks to extend and where they live;
     any pinned behaviour bytes the slice must reproduce. -->

### TDD steps
<!-- RED entries (test, expected failure reason) → GREEN (minimal code) → REFACTOR. -->

### Gate
<!-- The slice gate command(s) for this slice (from the manifest's gates.slice,
     placeholders resolved: <touched-tests>, <touched-files>). -->

### Commit
<!-- The exact conventional-commit message this slice lands as. -->

## Slice 2 — <name>

### Context
### TDD steps
### Gate
### Commit
