---
name: implementation
description: Craft phase 5 - execute the plan slice by slice, one slice-implementer agent each, sequential, with per-slice gates and one phase-boundary gate.
---

# craft:implementation

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Probe gates: `gates.slice` (else: repo test
   runner over touched files; else fall back to `gates.phase` per slice — slower,
   never gateless) and `gates.phase` (else: repo validate/check/test script; **if
   nothing exists, REFUSE to run this phase** — a workflow without any gate is not
   this workflow).
2. The plan must exist and pass `plan-lint.sh` (re-run it; cheap).
3. **Memory read/write surface (advisory).**
   READS: `gate-cmd` entry for this repo as an advisory hint — if a gate command was
   previously recorded, skip re-discovery but **still run it** (the gate is sacred; the
   hint only saves the probe, never the execution). A miss falls through to full gate
   probe as today.
   WRITES (buffered to run record, flushed at run end): the gate/test command discovered
   this run — stored as the BARE command only, with any leading env/secret assignment
   prefix stripped (never `TOKEN=… npm test` or a command carrying a credential), since
   the store is committed; per-slice `size` + pass/blocked `outcome` for each implemented
   slice.

## Procedure (default body — a manifest `override:` replaces everything below)

1. Execute slices top-to-bottom, **one craft:slice-implementer per slice,
   sequential** — never two agents writing one tree concurrently. Each spawn carries:
   the working directory; the plan path (the agent reads the slice there) + the slice's
   `### Context` block verbatim AND any load-bearing deltas — hand the pre-chew over so
   the agent never re-greps the codebase, but do NOT re-transcribe the whole committed
   slice; the design doc path; the resolved slice gate; the commit message from the
   plan; global + implementation-phase `context:` files verbatim.
2. **After each agent returns, verify before launching the next**: the commit exists
   and matches the slice promise (`git log`, `git show --stat`); spot-check
   conventions on the diff. Failed/blocked slice → fix in-session or escalate with
   the agent's options; dead agent → fresh respawn from the plan slice (artifact
   handoff); never relaunch blindly.
3. **Phase-boundary gate:** after the LAST slice, run `gates.phase` once in-session.
   It MUST be green before the review phase — fix and commit anything it surfaces
   (`fix(<scope>): close gate gap after slice N`).
