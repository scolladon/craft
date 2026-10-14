---
subjects:
  - engine/bin
---
# 560 — A behavioural sweep spawns every `engine/bin` bin through a symlink

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/bin-entry-symlink-guard.md · **Supersedes/Refines:** none

## Context

CI runs on Linux, where nothing is symlinked by default, so the defect never shows up there. A 25th bin written with the old guard would regress without anyone noticing unless a test reaches every bin through a link.

## Options considered

1. **Behavioural sweep** *(recommended)* — a test enumerates `engine/bin`, spawns each bin through a test-made symlink with bad input, and asserts it produces output. Pros: proves the property itself, enrols new bins automatically, ~1 s / cons: one fixture input per bin.
2. **Structural text pin** — cons: passes for a bin that imports the helper but calls it wrong.
3. **Both** — cons: the text match adds brittleness and catches nothing the sweep misses.

## Decision

Adopted-as-recommended (no user judgment): option 1. It satisfies the brief's RED requirement (a symlinked invocation with bad input must be loud) for every bin, as a behaviour test rather than a structure test.

## Consequences

The sweep is red on every platform until all 24 bins use the helper. Each new bin needs an entry with a loud bad input (for example `usage-mine --source bogus`).
