---
subjects:
  - docs/contributing/specs/codex-poc-record.md
  - BACKLOG.md
supersedes: []
---
# 677 — The codex re-probe records the rebuilt `craft` entry by name and source

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/codex-0163-reprobe.md · **Supersedes/Refines:** none

## Context

The committed marketplace declares `craft-codex` only, so `codex plugin add craft@…` fails. The
0.163.0 by-reference probe rebuilt the `craft` entry from `eab55ee^` in its throwaway, the route
ADR-635's Consequences prescribe for a re-measure.

## Options considered

1. **New rows say the committed marketplace declares `craft-codex` only and the probe rebuilt
   `craft` byte-for-byte from `eab55ee^`; older paragraphs stay as their versions' findings**
   *(recommended)*
2. **Option 1 plus rewording the 0.144.6 BACKLOG paragraph** — cons: edits a dated finding
3. **Describe only "an entry with an out-of-tree `skills` reference"** — cons: drops what a later
   re-prober needs to rebuild the same entry

## Decision

Adopted-as-recommended (no user judgment): option 1. Aligns with ADR-635 and ADR-320.

## Consequences

A later re-measure can rebuild the identical entry from the named commit.
