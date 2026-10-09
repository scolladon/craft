---
subjects:
  - evals/decisions-escalates-fork/fixture/docs/design/shout-flag.md
---
# 425 — The escalates-fork fixture drops only the uncovered-fork sentence

- **Status:** accepted
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/harder-decisions-fork-fixture.md · **Supersedes/Refines:** none

## Context

The `decisions-escalates-fork` fixture's Why cell ends "Whether piped callers matter more than predictability is a product call no ADR covers." That sentence states the conclusion the decisions skill's triage is meant to reach, and the 2026-10-06 pilot scored both arms 1.00 (Δ 0.00). Other fixture lines point at the candidate too: the Design pointer "Its behaviour when stdout is not a terminal is decision candidate 1." and the "on a terminal" clause of Requirement 1.

## Options considered

1. **Drop the one sentence** *(recommended)* — pros: removes the only text naming the fork as uncovered; the case and its sibling `decisions-noop-when-clear` keep differing in one variable / cons: the Decision-candidates table still frames the choice as open
2. **Also drop the Design pointer** — pros: one less cue / cons: the sibling keeps the same pointer, so the pair differs in two variables
3. **Also drop "on a terminal" from Requirement 1** — pros: one less cue / cons: the requirement then reads as "shout everywhere", which tilts toward option (a) and closes the fork

## Decision

**adopted-as-recommended (no user judgment)** — the brief names the edit: drop the sentence, keep the trade-off. Option 1. The Why cell ends "Predictable and simplest, but scripts that match `Hello` break when a caller adds `--shout`."

## Consequences

- Prompt, scaffold, graders and the fixture ADR stay unchanged; `presents-options` still finds the recommendation **(a)**.
- The dated plan `docs/contributing/plan/plugin-eval-suite.md` keeps quoting the old sentence.
