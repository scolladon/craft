# 141 — Discovery reuses a read-only detection helper + the gate probe, never `worktree-setup.sh`

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P25-interactive-manifest-generator.md · **Supersedes/Refines:** none

## Context

The generator must probe repo capabilities (DC-3) before interviewing. Two probes exist today:
`scripts/worktree-setup.sh` (lockfile→ecosystem detection, but it *installs* dependencies — no
read-only mode) and the gate probe (read-only test-command discovery). A global craft rule
forbids state-mutating probes against the worktree.

## Options considered

1. **Call `worktree-setup.sh` + gate probe as-is** — cons: `worktree-setup.sh` mutates the tree (installs deps), violating the read-only / R8 rule.
2. **Factor a read-only detection helper (lockfile→ecosystem) shared with `worktree-setup.sh`; reuse the gate probe directly** *(designer recommendation)* — pros: no side effects, no duplication of test-command discovery.
3. **Fully purpose-built probe** — cons: duplicates the existing gate probe.

## Decision

`craft:init` builds its `CapabilityReport` from a read-only detection helper (the
lockfile→ecosystem table, factored so `worktree-setup.sh` can share it) plus the existing
read-only gate probe. It never calls `worktree-setup.sh` (which installs deps). Any
state-mutating probe (e.g. checking whether a tool inits) runs in a `mktemp` throwaway, never
the worktree. **Adopted-as-recommended (no user judgment)** — forced by the no-mutation rule
and DRY.

## Consequences

- The lockfile→ecosystem detection becomes a shared read-only helper.
- The generator's probe is side-effect-free against the user's working tree.
