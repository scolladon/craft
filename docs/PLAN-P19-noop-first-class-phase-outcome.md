# Plan — P19: "Nothing to do" first-class phase outcome (skill-prose only)

> Source: design doc `docs/DESIGN-P19-noop-first-class-phase-outcome.md` · ADRs `100, 101, 102, 103`
> The plan is the implementation script AND the knowledge handoff. Part agents start with zero
> context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Surface gate (binding — holds at every commit)

- **Wording-only, three skill files.** Edits are confined to `skills/decisions/SKILL.md`,
  `skills/refactoring/SKILL.md`, `skills/run/SKILL.md`. NO `engine/` code, NO `src/` delta, NO
  `pipeline/default.yml`, NO descriptor, NO `contracts/` change. `git diff --stat` for the whole
  change touches only `docs/` and those three `SKILL.md` files.
- **Regression guard stays green:** `cd engine && npm test` (i.e. `node --test 'test/**/*.test.js'`)
  passes at every commit. It does not exercise the prose — it proves the no-engine-delta claim.
- **No provenance refs inside the skill files:** no `ADR-100/101/102/103`, no `P19`, no backlog id
  in any edited `SKILL.md` body. Provenance lives in this plan, the design doc, the ADRs, and the PR.
  (The `NO-OP(<phase>):` token is vocabulary, not a provenance ref — it is REQUIRED in the bodies.)
- **No suppression directives, no swallowed errors** — N/A to prose, but no edit may introduce any.
- **Greppable symmetry holds after the change:** a single `grep -rF 'NO-OP(' skills/` finds both
  judgment no-op lines (`NO-OP(decisions):` in `decisions`, `NO-OP(refactoring):` in `refactoring`)
  plus the orchestrator clause naming the `NO-OP(<phase>):` token in `run`.

## Sizing rules

- These are **docs-only / prose parts with no `src/` delta** — per the template's sizing
  exception they are legitimately standalone (each skill file has no implementation part to fold
  into). There is **no `node --test` surface for markdown**; do NOT invent unit tests for prose.
- Each part is one skill file = one atomic conventional commit. RED for each part is the
  **mechanical positive+negative grep** that must flip from failing to passing, plus the existing
  engine suite that must stay green (the behavior-preserving guardrail). GREEN is the wording edit.
- Parts 1 and 2 touch disjoint files and are order-free. Part 3 (`run`) names the
  `NO-OP(decisions):`/`NO-OP(refactoring):` tokens that Parts 1 & 2 introduce; its clause is
  self-contained prose, but it reads most naturally last — keep the 1→2→3 order.

## Part 1 — decisions: adopt-or-escalate triage + first-class `NO-OP(decisions):` no-op + ADR-author every settled choice

### Context
<!-- Pre-chewed, exhaustive — the agent must NOT need to re-explore. -->
Touch **only** `skills/decisions/SKILL.md`. This is the largest of the three edits; it rewrites
steps 1–2, widens step 3 (renumbered 4) and step 4 (renumbered 5), and leaves step 5 (renumbered 6)
verbatim. The design doc's "Edit 1" Current/Replacement blocks are the source of truth — the live
file matches the design's "Current" blocks **verbatim** (confirmed). The default body lives under
`## Procedure (default body …)` (line ~14); the procedure is `ENTIRELY session-owned — never
delegated.` (line ~16). Preamble (lines 8–12) and frontmatter (lines 1–4) are untouched.

The four numbered steps to transform (live file, lines 18–31):

A. **Steps 1+2 (lines 18–22) — replace with three steps.** Current:
```
1. No decision candidates from design? Skip honestly (run record: "no user-judgment
   decisions") — never invent questions.
2. Per candidate: present ≤3 options with the design's recommendation; capture the
   user's decision.
```
Replace with (lift verbatim from design Edit 1 Replacement; this introduces the adopt-or-escalate
triage = ADR-100, the first-class `NO-OP(decisions):` no-op = ADR-103, and the
adopted-choices-are-ADRs framing = ADR-101):
```
1. **Triage every candidate (session-owned) into adopt-or-escalate.** A candidate is
   ADOPTED without escalation when the design's recommendation is clear AND aligns with
   an existing ADR or a stated craft principle. A candidate is a GENUINE FORK — and is
   escalated — when the recommendation is unclear, the alternatives carry a real
   user-judgment trade-off, or it deviates from an existing ADR/principle. When in
   doubt, escalate: adopt only the unambiguous.
2. **Genuine forks → user conversation.** Per escalated candidate: present ≤3 options
   with the design's recommendation; capture the user's decision.
3. **No genuine forks (zero candidates, or every candidate adopted) → first-class
   no-op.** Record `NO-OP(decisions): no user-judgment decisions — <justification>` in
   the run record, the 1–3 line justification naming the adopted ADR/principle each
   choice aligns with (so the no-op is auditable, not asserted). Never invent questions
   or manufacture a conversation. Adopted recommendations stand as the design states
   them; they ARE still authored as ADRs (see step 5), marked **adopted-as-recommended
   (no user judgment)** so the decision trail is complete — the no-op concerns the
   *escalation conversation*, not the ADR record.
```

B. **Step 3 → step 4 (lines 22–25) — widen + renumber.** Current:
```
3. **Cross-candidate interaction check (before authoring):** once all candidates are
   ratified, check whether any ratified choice's rationale is voided or altered by
   another ratified choice (a later choice can invalidate an earlier one's premise).
   If so, re-surface the affected candidate to the user for re-decision before authoring.
```
Replace with (renumbered 4; widened so a ratified fork can void an *adopted* choice's premise):
```
4. **Cross-candidate interaction check (before authoring):** once all candidates are
   settled (escalated ones ratified, the rest adopted), check whether any settled
   choice's rationale is voided or altered by another (a later choice can invalidate an
   earlier one's premise — including a ratified fork voiding an adopted choice). If so,
   re-surface the affected choice — escalating an adopted choice to the user if its
   premise is now in genuine doubt — before authoring.
```

C. **Step 4 → step 5 (lines 26–27) — widen + renumber.** Current:
```
4. Author each ratified decision as `<adr-dir>/NNN-<title>.md` from the template; commit
   each as `docs(adr): NNN <title>`.
```
Replace with (renumbered 5; widened to author every settled — ratified AND adopted — choice = ADR-101):
```
5. Author each settled decision — ratified (escalated-and-decided) *and* adopted
   (taken-as-recommended) — as `<adr-dir>/NNN-<title>.md` from the template; commit each
   as `docs(adr): NNN <title>`. An adopted choice's ADR marks its Decision section
   **adopted-as-recommended (no user judgment)** so the log stays distinguishable from a
   ratified choice, whose ADR records the user's judgment.
```

D. **Step 5 → step 6 (lines 28–31) — VERBATIM, renumber only.** Current step 5 is the scope-fold
rule. Change the leading `5.` to `6.` and change nothing else in its body. (It fires only when a
decision *deviates* from the design's recommendation; an adopted choice takes the recommendation as
written, so it never trips the fold even though it now produces an ADR — this is correct and
intended, leave the body untouched.) Current:
```
5. **Scope-fold rule:** if any decision deviates from the design's recommendation,
   spawn a FRESH **craft:designer** to revise — fed the ADR + design-doc PATHS (the
   committed artifacts, read in-place; never your conversation) — committing
   `docs(design): revise <slug> against ADRs <range>` BEFORE the planning phase.
```
becomes the same text with `6.` as the marker.

Provenance discipline: the inline `docs(adr): NNN <title>` and `docs(design): revise <slug> against
ADRs <range>` strings are pre-existing skill vocabulary (commit-message templates the phase emits at
runtime), NOT provenance refs to this change — leave them. Do not add any `ADR-100/101/103` literal.

### TDD steps
<!-- RED → GREEN → REFACTOR. Mechanical/textual verification — no node test for prose. -->
- RED (mechanical, must fail before the edit):
  - positive greps (absent now): `grep -F 'NO-OP(decisions): no user-judgment decisions' skills/decisions/SKILL.md`;
    `grep -F 'adopt-or-escalate' skills/decisions/SKILL.md`;
    `grep -F 'adopted-as-recommended (no user judgment)' skills/decisions/SKILL.md`;
    `grep -F 'each settled decision' skills/decisions/SKILL.md`.
  - negative grep (present now, must be gone after): the old sole-skip step —
    `grep -F 'Skip honestly (run record: "no user-judgment decisions")' skills/decisions/SKILL.md`
    and the old `Author each ratified decision` line must no longer match.
- GREEN: apply edits A, B, C, D above (lift the Replacement text verbatim).
- REFACTOR: re-read the procedure top-to-bottom — steps are renumbered 1–6 contiguous, no orphan
  reference to an old step number, the scope-fold body is byte-identical to the pre-edit step 5.

### Gate
`cd engine && npm test` (regression guard — must stay green; the prose edit touches no engine code).
Then the mechanical checks: positive greps above all match; negative greps return nothing;
`git diff --stat` shows only `skills/decisions/SKILL.md` modified.

### Commit
`feat(decisions): adopt-without-escalation triage and first-class NO-OP(decisions) outcome`

## Part 2 — refactoring: state the no-op contract symmetrically with `NO-OP(refactoring):` + PR-body carry

### Context
Touch **only** `skills/refactoring/SKILL.md`. Single-step edit: rewrite step 2 of the default
procedure (live file, lines 19–21) under `## Procedure (default body …)` (line ~12). The live text
matches the design's "Edit 2" Current block **verbatim** (confirmed). Steps 1, 3, 4, 5 are untouched;
preamble (lines 8–10) and frontmatter (lines 1–4) untouched.

Current step 2 (lines 19–21):
```
2. **Nothing clears the bar → no-op WITH a 1–3 line written justification** in the run
   record (what was considered, why nothing changed). Spawning an agent to conclude
   no-op is forbidden waste. A silent skip is not allowed.
```
Replace with (lift verbatim from design Edit 2 Replacement; adds the `NO-OP(refactoring):` token =
ADR-103, the PR-body-carry contract = ADR-102, and the explicit symmetry-with-decisions framing,
while preserving the existing "forbidden waste" and "no silent skip" rules):
```
2. **Nothing clears the bar → first-class no-op.** Record
   `NO-OP(refactoring): nothing cleared the bar — <justification>` in the run record,
   the 1–3 line justification stating what was considered and why nothing changed; the
   run record is carried into the PR body (documentation phase), so the no-op is stated,
   not hidden. This is a recorded outcome symmetric with the decisions phase's
   `NO-OP(decisions):` line — same token, kept idiom — not an implicit skip. Spawning an
   agent merely to conclude no-op is forbidden waste. A silent skip is not allowed.
```
Note (do NOT add an analog to decisions): the "spawning an agent … forbidden waste" rule has no
decisions-side analog because decisions is `ENTIRELY session-owned — never delegated` (no agent to
forbid). That asymmetry is intentional — Part 1 adds no such clause.

### TDD steps
- RED (mechanical, must fail before the edit):
  - positive greps (absent now): `grep -F 'NO-OP(refactoring): nothing cleared the bar' skills/refactoring/SKILL.md`;
    `grep -F 'first-class no-op' skills/refactoring/SKILL.md`;
    `grep -F 'carried into the PR body' skills/refactoring/SKILL.md`;
    `grep -F 'symmetric with the decisions phase' skills/refactoring/SKILL.md`.
  - negative grep (present now, must be gone after): the old phrasing —
    `grep -F 'no-op WITH a 1–3 line written justification' skills/refactoring/SKILL.md`.
  - preserved-rule greps (must STILL match after the edit): `grep -F 'forbidden waste' skills/refactoring/SKILL.md`;
    `grep -F 'A silent skip is not allowed' skills/refactoring/SKILL.md`.
- GREEN: apply the step-2 replacement above (verbatim).
- REFACTOR: confirm steps 1, 3, 4, 5 are byte-unchanged. Dash fidelity: the `NO-OP(refactoring):
  nothing cleared the bar — <justification>` token separator is an em-dash `—` (U+2014, matching the
  `NO-OP(decisions):` token in Part 1); the preserved `1–3 line justification` keeps its en-dash `–`
  (U+2013) exactly as the live file already has it. Do not swap one for the other.

### Gate
`cd engine && npm test` (regression guard — must stay green). Then: positive + preserved-rule greps
match; negative grep returns nothing; `git diff --stat` shows only `skills/refactoring/SKILL.md`.

### Commit
`feat(refactoring): symmetric first-class NO-OP(refactoring) contract carried into PR body`

## Part 3 — run: orchestrator reads a recorded judgment no-op as a first-class terminal outcome

### Context
Touch **only** `skills/run/SKILL.md`. Single-clause edit: APPEND one sentence to phase-walk step 6
("Record outcome"). The clause makes a recorded `NO-OP(<phase>):` line from a judgment phase an
accepted terminal outcome the orchestrator never re-runs or escalates as a gap. There is NO gate
logic to add — judgment phases (`decisions`/`refactoring`) are gate-less, so no `propose`-gate entry
is released here (that mechanism, ADR-082, covers only executing-harness no-ops and is untouched).

**DRIFT — read carefully.** The design's "Edit 3" Current block quotes step 6 as
`**Record outcome** in run record (appended to seeded entries). An inline-executed phase noted: …`.
The **LIVE** file (lines 187–188) actually reads, with three extra words:
```
6. **Record outcome** in the run record (appended to the seeded entries). An
   inline-executed phase is noted: `inline: <phase.id> — ran in-session`.
```
(design dropped two `the`s and the word `is`). The change is **purely additive** — append the new
sentence after the existing `inline:` sentence. Do **NOT** paste the design's Replacement wholesale,
because its first two lines reproduce the design's abbreviated "Current" wording and would silently
regress the live prose (`the run record`→`run record`, `is noted`→`noted`). Keep the live
first-sentence wording exactly; only add the second sentence.

Edit: replace the live step 6 (lines 187–188) with the live first sentence UNCHANGED plus the
appended judgment-no-op clause (the clause text is the additive tail of the design Edit 3 Replacement):
```
6. **Record outcome** in the run record (appended to the seeded entries). An
   inline-executed phase is noted: `inline: <phase.id> — ran in-session`. A judgment
   phase (`decisions`/`refactoring`) that records a `NO-OP(<phase>):` line — e.g.
   `NO-OP(decisions): no user-judgment decisions — …` or `NO-OP(refactoring): nothing
   cleared the bar — …` — has produced its outcome; it is NOT a missing artifact and
   never re-runs or escalates as a gap.
```
Everything else in the file (the Cross-phase invariants, the executing-harness no-op release block at
lines ~225–233 which is a *different* mechanism, the walk error-path table, etc.) is untouched.

### TDD steps
- RED (mechanical, must fail before the edit):
  - positive greps (absent now): `grep -F 'NOT a missing artifact' skills/run/SKILL.md`;
    `grep -F 'records a `NO-OP(<phase>):` line' skills/run/SKILL.md`;
    `grep -F 'never re-runs or escalates as a gap' skills/run/SKILL.md`.
  - drift-guard greps (the live first sentence MUST still match after the edit — proves no prose
    regression): `grep -F 'in the run record (appended to the seeded entries)' skills/run/SKILL.md`
    and `grep -F 'inline-executed phase is noted' skills/run/SKILL.md` both still match.
- GREEN: replace step 6 with the live-first-sentence + appended clause above.
- REFACTOR: confirm the executing-harness no-op release block (Cross-phase invariants) and the walk
  error-path table are byte-unchanged; only step 6 of the phase walk gained the trailing sentence.

### Gate
`cd engine && npm test` (regression guard — must stay green). Then: positive greps match;
drift-guard greps (`in the run record (appended to the seeded entries)`,
`inline-executed phase is noted`) STILL match; `git diff --stat` shows only `skills/run/SKILL.md`.

### Commit
`docs(run): recorded judgment no-op is a first-class terminal outcome, never a gap`
