# 324 — The locality advisory keeps its current specificity; the negative result is the deliverable

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/scheduled-backlog-sweep.md · **Supersedes/Refines:** refines ADR-306

## Context

`plan-lint`'s cognitive-locality warning fires on more plans than the design that introduced it
expected. Re-measured over the whole committed corpus today: 24 plans, 15 emitting, 54 warnings, 41
of them two-part overlaps. The originally recorded figures (49 warnings, 14 of 23 plans, 37
two-part) reproduce exactly once `codex-0145-limitation-reprobe.md` — added 2026-07-31 — is
subtracted, so nothing drifted structurally; one plan was added. A trap worth recording: the
recorded `49` is the *mergeable subtotal*, not the total.

Two remedies were named when the entry was scoped, both aimed at specificity: weight by whether a
shared path is *edited* versus merely *referenced*, and skip paths declared only inside quoted
snippets. Both were implemented as measurement harnesses and run over the corpus rather than
estimated.

The constraint on this decision was fixed in advance: the remedy is specificity, never a downgrade
from advisory, and never suppression of the widest overlaps to improve the statistic — that was
tried once and reverted.

## Options considered

1. **Leave the detector unchanged; record the re-measured baseline and the negative result for both named candidates** *(recommended)* — pros: reports what the data actually showed; costs nothing and forecloses nothing / cons: the operator-facing noise the entry was opened about stays exactly as it is.
2. **Ship the edit-versus-reference weighting** — pros: cuts 54 warnings to 8 / cons: that is a near-disable, not a specificity gain — only 6 of 41 two-part overlaps survive, `### Commit` carries zero resolvable paths in 163 of 163 parts so half its stated input channel does not exist, 54% of its removals rest on absent rather than contrary evidence, and it destroys at least one confirmed genuine edit-edit overlap because two parts spelled the same path differently.
3. **Ship the cue-based (quoted-snippet) filter after building a labelled sample to calibrate it** — pros: the one direction the data supports — 4 of 54 removed, all four true noise by manual reading / cons: a 7% filter validated on an unlabelled sample is a hypothesis, not a result.

## Decision

**Ratified by the user.** The detector is unchanged. The deliverable is the measurement: the
re-measured baseline, and the negative result for both named candidates, recorded here.

The rule for future work: a proposed specificity change to this advisory must be measured over the
whole committed plan corpus before it ships, and must be rejected if it removes genuine overlaps —
a large drop in the warning count is evidence *against* a candidate, not for it, unless every
removal is shown to be noise.

## Consequences

The advisory keeps firing at today's rate, and operators may still learn to ignore the line. That
risk is accepted in exchange for not shipping a near-disable dressed as a refinement. The check
stays advisory (ADR-306) and no wide overlap is suppressed, under this ruling as under every
alternative.

Two facts are worth carrying forward. The quoted-snippet candidate's premise is *already satisfied
by accident*: the detector matches backticks over the joined context block, and a fence re-pairs
everything after it, so paths inside fenced snippets mostly do not reach the matcher in the first
place — its single removal under the literal reading was a five-space-indented table row nested
under a list item, read as a code block, which is a wrong removal. And `### Commit` is not a usable
input channel for any future weighting: it resolves zero paths across all 163 parts in the corpus.

The cue-based filter is the live follow-up direction, and it needs a labelled sample first. That
belongs in the backlog, not in this run.
