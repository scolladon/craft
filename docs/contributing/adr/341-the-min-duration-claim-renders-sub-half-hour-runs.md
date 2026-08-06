# 341 — The min-duration claim renders sub-half-hour runs

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** amends ADR-274

## Context

ADR-274 fixed the README FAQ drift guard's conventions: run count exact, median to one
decimal, **min to the nearest half hour (0.5 ⇒ "half an hour")**, max to integer. That min
rule silently assumed the shortest telemetered run would always round to 0.5.

Regenerating the baseline under the corrected miner broke the assumption. The guard is
implemented as `rounded === 0.5 && costClaims.min === 'half an hour'` — it returns clean for
exactly one value, so **no README wording can satisfy it** once the shortest run rounds to
anything else. The regenerated corpus' three shortest duration-bearing runs are 0.153h, 0.182h
and 0.240h; all round to 0. The guard is only ever satisfiable when the shortest run happens to
land between 15 and 45 minutes.

The asymmetry that caused it is visible in the extractor: `runCount`, `median` and `max` are
each captured by a regex, while `min` alone is a literal `section.includes('half an hour')`
check. One claim was expressed as a fixed string where its three siblings were expressed as
patterns.

This is a latent defect the corrected miner surfaced, not one it introduced — it would break
identically for any repository whose shortest run is under a quarter hour.

## Options considered

1. **Render sub-half-hour minima and capture the phrase by pattern** — pros: root-cause fix;
   makes the guard correct for any corpus; restores symmetry with the sibling claims / cons:
   amends an accepted ADR; touches a file outside the change's original scope.
2. **Filter non-craft runs out of the baseline to lift the min** — pros: no guard change /
   cons: discards real measured cost, changes what the miner reports, and does not even work —
   the 2nd and 3rd shortest runs are genuine craft runs that still round to 0.
3. **Leave the guard red until a separate change** — cons: violates never-commit-on-red.

## Decision

Ratified by the user: **option 1**, amending ADR-274's min rule.

The min claim is rendered from the recomputed value rather than pinned to one string:

- a min rounding to half an hour renders `half an hour` (ADR-274's rule, preserved);
- a min below half an hour renders `under <n> minutes`, where `<n>` is the run's duration
  rounded **up** to the next five minutes — up, so the claim is never an under-statement;
- above half an hour there is no phrasing convention, so the guard reports drift with the
  recomputed value, exactly as it does today.

The extractor captures the min phrase with a regex, like its three siblings, instead of testing
for one literal.

## Consequences

- ADR-274's other three conventions (count exact, median to one decimal, max to integer) are
  unchanged.
- The guard stops being satisfiable-by-coincidence: it now expresses whatever the corpus
  actually holds, so a future corpus with a very short run does not re-break it.
- The README FAQ's min phrasing becomes data-derived; the sentence's meaning is unchanged.
