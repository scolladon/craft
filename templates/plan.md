# Plan — <topic>

> Source: design doc `<path>` · ADRs `<numbers or none>`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

## Part 1 — <name>

### Context
<!-- Pre-chewed, exhaustive — the agent must NOT need to re-explore:
     exact file paths and symbol name-paths to touch; current signatures being
     changed; helpers/fixtures/describe blocks to extend and where they live;
     any pinned behaviour bytes the part must reproduce. -->

### TDD steps
<!-- RED entries (test, expected failure reason) → GREEN (minimal code) → REFACTOR. -->

### Gate
<!-- The part gate command(s) for this part (from the manifest's gates.part,
     placeholders resolved: <touched-tests>, <touched-files>). -->

### Commit
<!-- The exact conventional-commit message this part lands as. -->

## Part 2 — <name>

### Context
### TDD steps
### Gate
### Commit
