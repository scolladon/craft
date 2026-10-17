---
subjects:
  - skills/run/SKILL.md
  - engine/src/driver-state.js
  - docs/contributing/specs/driver.md
---
# 619 — A driven run finds its state dir in CRAFT_DRIVER_STATE, one dir per entry with fixed file names

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

An outside driver needs a status file and the next-item election written by the run. The spike rendered `{{STATE}}`/`{{N}}` into every brief by hand; craft had no contract.

## Options considered

1. **`CRAFT_DRIVER_STATE=<per-entry dir>`, fixed names `status`, `next.md`, `next.prompt`** *(recommended)* — pros: one variable, craft never learns the driver's numbering / cons: the driver makes one dir per entry
2. **`CRAFT_DRIVER_STATE` + `CRAFT_DRIVER_ENTRY=<N>` → `entry-<N>.status`, `entry-<N>.next-elected.md`** (spike layout) — cons: leaks the driver's scheme into craft; one markdown file needs a fence parser
3. **Two variables naming whole file paths** — cons: every new file is a new variable

## Decision

The user ratified option 1. A run is driven exactly when `CRAFT_DRIVER_STATE` holds an absolute path to an existing writable directory. Craft writes only `status`, `next.md` and `next.prompt` there; every other file belongs to the driver. Unset or empty: craft writes nothing and behaves as before.

## Consequences

- The driver owns entry numbering and per-entry dirs.
- Set but invalid (relative, missing, not a dir, not writable): surfaced in-session, the run continues undriven.
