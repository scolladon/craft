---
name: implement
description: Forge phase 5 - execute the plan slice by slice, one slice-implementer agent each, sequential, with per-slice gates and one phase-boundary gate.
---

# forge:implement

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Probe gates: `gates.slice` (else: repo test
   runner over touched files; else fall back to `gates.phase` per slice — slower,
   never gateless) and `gates.phase` (else: repo validate/check/test script; **if
   nothing exists, REFUSE to run this phase** — a workflow without any gate is not
   this workflow).
2. The plan must exist and pass `plan-lint.sh` (re-run it; cheap).

## Procedure (default body — a manifest `override:` replaces everything below)

1. Execute slices top-to-bottom, **one forge:slice-implementer per slice,
   sequential** — never two agents writing one tree concurrently. Each spawn carries:
   the working directory; the plan path + the slice text AND its `### Context` block
   verbatim (hand it over — do not let the agent re-grep what the plan pre-chewed);
   the design doc path; the resolved slice gate; the commit message from the plan;
   global + implement-phase `context:` files verbatim.
2. **After each agent returns, verify before launching the next**: the commit exists
   and matches the slice promise (`git log`, `git show --stat`); spot-check
   conventions on the diff. Failed/blocked slice → fix in-session or escalate with
   the agent's options; dead agent → fresh respawn from the plan slice (artifact
   handoff); never relaunch blindly.
3. **Phase-boundary gate:** after the LAST slice, run `gates.phase` once in-session.
   It MUST be green before the review phase — fix and commit anything it surfaces
   (`fix(<scope>): close gate gap after slice N`).
