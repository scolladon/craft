---
name: implementation
description: Craft phase 5 - execute the plan part by part, one part-implementer agent each, sequential, with per-part gates and one phase-boundary gate.
---

# craft:implementation

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Probe gates: `gates.part` (else: repo test
   runner over touched files; else fall back to `gates.phase` per part — slower,
   never gateless) and `gates.phase` (else: repo validate/check/test script; **if
   nothing exists, REFUSE to run this phase** — a workflow without any gate is not
   this workflow).
2. The plan must exist and pass `plan-lint.sh` (re-run it; cheap).
3. **Memory read/write surface (advisory).**
   READS: `gate-cmd` entry for this repo as an advisory hint — if a gate command was
   previously recorded, skip re-discovery but **still run it** (the gate is sacred; the
   hint only saves the probe, never the execution). A miss falls through to full gate
   probe as today.
   WRITES (appended to the run record as produced; saved to the store once at `Done`):
   the gate/test command discovered this run — stored as the BARE command only, with any
   leading env/secret assignment prefix stripped (never `TOKEN=… npm test` or a command
   carrying a credential), since the store is committed; per-part `size` + pass/blocked
   `outcome` for each implemented part.

## Procedure (default body — a manifest `override:` replaces everything below)

1. Execute parts top-to-bottom, **one craft:part-implementer per part,
   sequential** — never two agents writing one tree concurrently. Each spawn carries:
   the working directory; the plan path (the agent reads the part there) + the part's
   `### Context` block verbatim AND any load-bearing deltas — hand the pre-chew over so
   the agent never re-greps the codebase, but do NOT re-transcribe the whole committed
   part; the design doc path; the resolved part gate; the commit message from the
   plan; global + implementation-phase `context:` files verbatim.
2. **After each agent returns, verify before launching the next**: the commit exists
   and matches the part promise (`git log`, `git show --stat`). Once verified, in that
   same verification's Bash call or the very next one, append
   `PART(<n>): <sha> size=<size> outcome=<pass|blocked>` via
   `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/run-ledger.sh" append <run-id>
   implementation` — `<size>` is one kebab-case shape label for the part (e.g.
   `pure-module`, `docs-prose`), `?` when unknown; a label with a space breaks the token. A landed commit found without a `PART` line on resume is verified
   first, then gets its line. Spot-check conventions on the diff. Failed/blocked part →
   fix in-session or escalate with the agent's options; dead agent → fresh respawn from
   the plan part (artifact handoff); never relaunch blindly.
3. **Phase-boundary gate:** after the LAST part, run `gates.phase` once in-session.
   It MUST be green before the review phase — fix and commit anything it surfaces
   (`fix(<scope>): close gate gap after part N`).
