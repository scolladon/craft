# Design — "Nothing to do" as a first-class phase outcome (P19)

> Brief: P19 (promoted session feedback 2026-06-20). Make a clean no-op a **recorded, first-class**
> outcome for both judgment phases — `decisions` and `refactoring` — symmetrically, not an implicit
> skip. `decisions` must be allowed to adopt clear, ADR/principle-aligned recommendations **without**
> escalating to the user, recording a `NO-OP(decisions):` outcome and escalating only genuine
> forks. `refactoring`'s already-honest no-op gets its contract stated symmetrically (run-record line +
> PR-body note). The orchestrator must never read either no-op as a gap.
> Status: docs-only phase, implemented directly (craft conventions) — wording-only edits to
> `skills/decisions/SKILL.md`, `skills/refactoring/SKILL.md`, and `skills/run/SKILL.md` prose; no
> `engine/`, descriptor, or `contracts/` change. This doc + the ADRs are the provenance.

## Context

Craft already treats a *recorded* runtime no-op as first-class for the **executing-harness** phases.
`skills/architecture/SKILL.md` step 2 ends absent-config runs with "**no-op with a note** in the run
record"; `skills/validation/SKILL.md` does the same on an absent mutation tool; and
[[adr/082-propose-gate-release-on-runtime-no-op]] made a recorded validation no-op *release* its
`propose`-gate — "mechanism over memory", orchestrator/skill prose, no engine code. That is the
established craft pattern: **a recorded no-op is an outcome, not a hole.**

The two **judgment** phases (`decisions`, `refactoring`) are session-owned and gate-less, but they
treat "nothing to do" unevenly:

- **`refactoring`** (`skills/refactoring/SKILL.md` step 2) already permits an honest no-op WITH a
  1–3 line written justification in the run record, and already forbids spawning an agent merely to
  conclude no-op. What it does **not** state is the no-op **contract**: the recorded vocabulary and the
  fact that the line surfaces into the PR body — so it cannot be read as symmetric with `decisions`.
- **`decisions`** (`skills/decisions/SKILL.md`) only no-ops in the *zero-candidate* case (step 1:
  "No decision candidates from design? Skip honestly … never invent questions"). When candidates
  **exist**, step 2 forces a per-candidate user conversation *even where every recommendation is clear
  and aligns with existing ADRs/principles*. Accepted session direction (the brief's origin) says an
  empty decisions phase is good when every choice is clear — the same spirit as refactoring's honest
  no-op. Today the skill has no path to honor that: it must escalate every candidate.

The orchestrator already carries the no-op vocabulary it needs. `skills/run/SKILL.md` seeds the run
record from `Resolution.record[]` and appends "phase outcomes, skip reasons, **no-op justifications**,
probe results, forced actions" (§0 step 1c, step 4). `skills/documentation/SKILL.md` step 3 drafts the
PR body and explicitly includes "the run record"; `skills/propose/SKILL.md` step 3 ships that body.
⇒ **a run-record no-op line already flows into the PR body with no new plumbing.** The remaining gap is
that the two judgment phases must *write* symmetric no-op lines, and the orchestrator must be told a
judgment no-op is a valid outcome (it is gate-less, so there is no `propose`-gate release to add — the
only orchestrator risk is *reading the no-op as a missing artifact*).

Constraining precedents:

- [[adr/082-propose-gate-release-on-runtime-no-op]] — recorded runtime no-op is first-class; mechanism
  over memory; prose not engine. P19 is the same philosophy applied to the judgment phases.
- [[adr/005-skip-reorder-strictness]] — **every skip/waiver is loudly visible in the run record**; craft's
  accountability ledger is the run record. A first-class no-op must be *recorded*, never silent.
- `skills/architecture/SKILL.md` step 2 — the canonical "no-op with a note" phrasing this design aligns to.

## Requirements

When this ships, all of the following are verifiable in the three edited skill files:

1. `decisions` has an explicit **adopt-without-escalation** path: when every surviving candidate's
   recommendation is clear and aligns with existing ADRs/principles, the session adopts the design's
   recommendations, escalates **no** candidate, and records a first-class no-op line — without inventing
   a user conversation.
2. `decisions` still escalates **genuine forks** (any candidate whose recommendation is not clear-and-aligned)
   and captures the user's decision. The cross-candidate-interaction check still runs over the **full settled
   set** (adopted + ratified). ADR authoring widens to bind **every settled** choice — ratified
   (escalated-and-decided) *and* adopted — with adopted ADRs marked **adopted-as-recommended (no user
   judgment)** so the decision trail is complete (ADR-101). The scope-fold rule continues to bind only a
   **deviation** from the design — an adopted recommendation takes the design as written, so it produces an
   ADR yet never trips the fold.
3. `refactoring`'s no-op clause states the same **contract** as `decisions`: the recorded vocabulary and
   that the line surfaces into the PR body. The existing "1–3 line justification" and "spawning an agent
   to conclude no-op is forbidden waste" rules are preserved.
4. The two phases' recorded no-op lines read **symmetrically** via a shared `NO-OP(<phase>):` token plus
   each phase's kept idiom (a reader — or a `grep -F 'NO-OP('` — of the run record / PR body finds both
   through one greppable prefix).
5. The orchestrator (`skills/run/SKILL.md`) never reads a judgment no-op as a gap: a recorded judgment
   no-op is an explicit, accepted phase outcome.
6. No change to `engine/`, pipeline descriptors, or `contracts/`. Edits are confined to
   `skills/decisions/SKILL.md`, `skills/refactoring/SKILL.md`, `skills/run/SKILL.md`, plus this doc and the ADRs.

## Design

The change is **wording-only**, in three files. Each block below gives the exact current text and the
exact replacement. The *threshold* for adopt-vs-escalate, the *ADR-weight* of adopted choices, the
*PR-body* mechanism, and the *recorded vocabulary* were the load-bearing choices surfaced as decision
candidates (DC-1…DC-4). All four are now **ratified** (ADRs 100–103); the wording below has been revised
to the ratified outcomes. The one deviation from the original recommendation — DC-2, where the user chose
"always author an ADR for adopted choices" over the recommended "record lightly" — has been folded into
Edit 1 below (see ADR-101).

### Deliverables

1. **`skills/decisions/SKILL.md`** — replace step 1 (currently zero-candidate-only) and step 2
   (currently per-candidate-always) with an explicit triage: adopt clear/aligned recommendations
   without escalating, escalate only genuine forks, record the outcome symmetrically.
2. **`skills/refactoring/SKILL.md`** — extend step 2's no-op clause to state the contract (recorded
   vocabulary + PR-body surfacing) symmetrically with decisions.
3. **`skills/run/SKILL.md`** — one orchestrator-prose touch: a recorded judgment no-op is a first-class
   outcome, not a gap (no gate release — these phases are gate-less).
4. **ADRs 100–103** (see Decision candidates) + this provenance doc.

### Edit 1 — `skills/decisions/SKILL.md` (the asymmetry's core)

Current step 1 + step 2:

```
1. No decision candidates from design? Skip honestly (run record: "no user-judgment
   decisions") — never invent questions.
2. Per candidate: present ≤3 options with the design's recommendation; capture the
   user's decision.
```

Replacement (written against DC-1 → ADR-100 = *clear-and-aligned* test; DC-2 → ADR-101 = every settled
choice — ratified AND adopted — is authored as an ADR, adopted ones marked adopted-as-recommended;
DC-4 → ADR-103 = the `NO-OP(<phase>):` token vocabulary):

```
1. **Triage every candidate (session-owned) into adopt-or-escalate.** A candidate is
   ADOPTED without escalation when its design recommendation is clear AND aligns with
   an existing ADR or a stated craft principle. A candidate is a GENUINE FORK —
   escalated — when the recommendation is unclear, the alternatives carry a real
   user-judgment trade-off, or it deviates from an existing ADR/principle. When in
   doubt, escalate: adopt only the unambiguous.
2. **Genuine forks → user conversation.** Per escalated candidate: present ≤3 options
   with the design's recommendation; capture the user's decision.
3. **No genuine forks (zero candidates, or every candidate adopted) → first-class
   no-op.** Record `NO-OP(decisions): no user-judgment decisions — <justification>` in
   the run record, the 1–3 line justification naming what was adopted and the
   ADR/principle each aligns with (so the no-op is auditable, not asserted). Never invent questions to manufacture a
   conversation. Adopted recommendations stand as the design states them; they ARE
   still authored as ADRs (see step 5), each marked **adopted-as-recommended (no user
   judgment)** so the decision trail is complete — the no-op concerns the *escalation
   conversation*, not the ADR record.
```

The existing steps 3–5 (cross-candidate interaction check, ADR authoring, scope-fold) renumber to 4–6.
Steps 3→4 (interaction check) and 4→5 (ADR authoring) change wording — the first so adopt-without-escalation
participates in the interaction check, the second so authoring widens to settled (ratified + adopted)
choices under ADR-101; step 5→6 (scope-fold) is verbatim, renumbered. Current step 3:

```
3. **Cross-candidate interaction check (before authoring):** once all candidates are
   ratified, check whether any ratified choice's rationale is voided or altered by
   another ratified choice (a later choice can invalidate an earlier one's premise).
   If so, re-surface the affected candidate to the user for re-decision before authoring.
```

Replacement (renumbered to 4; widened so a ratified fork can void an *adopted* choice's premise, not only
another fork's):

```
4. **Cross-candidate interaction check (before authoring):** once all candidates are
   settled (escalated ones ratified, the rest adopted), check whether any settled
   choice's rationale is voided or altered by another (a later choice can invalidate an
   earlier one's premise — including a ratified fork voiding an adopted choice). If so,
   re-surface the affected choice — escalating an adopted choice to the user if its
   premise is now in genuine doubt — before authoring.
```

- **Author each settled decision as an ADR** (was step 4 → now 5): **widened** under ADR-101. The current
  step authors each **ratified** decision; it must broaden to author each **settled** decision — ratified
  *and* adopted — with adopted ADRs marked **adopted-as-recommended (no user judgment)** to stay
  distinguishable from ratified (escalated-and-decided) ones. Current step 4:

  ```
  4. Author each ratified decision as `<adr-dir>/NNN-<title>.md` from the template; commit
     each as `docs(adr): NNN <title>`.
  ```

  Replacement (renumbered to 5, widened to settled choices):

  ```
  5. Author each settled decision — ratified (escalated-and-decided) *and* adopted
     (taken-as-recommended) — as `<adr-dir>/NNN-<title>.md` from the template; commit each
     as `docs(adr): NNN <title>`. An adopted choice's ADR marks its Decision section
     **adopted-as-recommended (no user judgment)** so the log stays distinguishable from a
     ratified choice, whose ADR records the user's judgment.
  ```
- **Scope-fold rule** (was step 5 → now 6): **verbatim**, renumbered. It fires "if any decision deviates
  from the design's recommendation" — an adopted choice *is* taking the recommendation as written, so it
  never trips the fold even though it now produces an ADR; only a user overruling an escalated fork against
  the design can. Left untouched.

### Edit 2 — `skills/refactoring/SKILL.md` (state the contract symmetrically)

Current step 2:

```
2. **Nothing clears the bar → no-op WITH a 1–3 line written justification** in the run
   record (what was considered, why nothing changed). Spawning an agent to conclude
   no-op is forbidden waste. A silent skip is not allowed.
```

Replacement (written against DC-3 recommendation = PR-body note IS the run-record line carried into the
body, no dedicated bullet; DC-4 recommendation = shared `NO-OP(<phase>):` token + kept idiom):

```
2. **Nothing clears the bar → first-class no-op.** Record
   `NO-OP(refactoring): nothing cleared the bar — <justification>` in the run record,
   the 1–3 line justification stating what was considered and why nothing changed; the
   run record is carried into the PR body (documentation phase), so the no-op is stated,
   not hidden. This is a recorded outcome symmetric with the decisions phase's
   `NO-OP(decisions):` line — same token, kept idiom — not an implicit skip. Spawning an
   agent merely to conclude no-op is forbidden waste. A silent skip is not allowed.
```

This adds the *contract* (PR-body surfacing + the explicit symmetry-with-decisions framing) and the
"first-class no-op" vocabulary while preserving every existing rule. The decisions analog of refactoring's
"spawning an agent to conclude no-op is forbidden waste" is already structural: decisions is
"ENTIRELY session-owned — never delegated", so there is no agent to forbid — Edit 1 needs no analog clause.

### Edit 3 — `skills/run/SKILL.md` (orchestrator never reads a no-op as a gap)

The run record already lists "no-op justifications" as a first-class appended outcome (§0 step 1c, step 4),
and the `propose`-gate already releases on a recorded executing-harness no-op (§ Cross-phase invariants,
per [[adr/082-propose-gate-release-on-runtime-no-op]]). Judgment phases are **gate-less**, so there is no
gate to release. The only orchestrator risk is the session reading a judgment no-op as a missing artifact
when verifying the phase. One clause, appended to the per-phase "Record outcome" step (step 6 of the phase
walk), makes the no-op an accepted terminal state:

Current step 6:

```
6. **Record outcome** in run record (appended to seeded entries). An
   inline-executed phase noted: `inline: <phase.id> — ran in-session`.
```

Replacement:

```
6. **Record outcome** in run record (appended to seeded entries). An
   inline-executed phase noted: `inline: <phase.id> — ran in-session`. A judgment
   phase (`decisions`/`refactoring`) that records a `NO-OP(<phase>):` line — e.g.
   `NO-OP(decisions): no user-judgment decisions — …` or `NO-OP(refactoring): nothing
   cleared the bar — …` — has produced its outcome; it is NOT a missing artifact and
   never re-runs or escalates as a gap.
```

This is symmetric with how `architecture`/`validation` no-ops are already handled (a recorded note ends
the phase) and adds **no** gate logic — judgment phases have no `propose`-gate entry to release.

### Pinned: the recorded-vocabulary matrix (the symmetry contract)

The whole point is that the two phases read symmetrically in the same ledger. Per the ratified outcomes
(DC-4 → ADR-103), the two judgment phases share a fixed `NO-OP(<phase>):` token followed by each phase's
kept idiom + justification, so the run record carries (each is a real, greppable line a reader sees):

| Phase | Trigger | Recorded run-record line | In PR body? |
|---|---|---|---|
| `decisions` | zero candidates OR all adopted | `NO-OP(decisions): no user-judgment decisions — <adopt/align justification>` | yes (run record carried) |
| `refactoring` | nothing clears the bar | `NO-OP(refactoring): nothing cleared the bar — <what was considered / why nothing changed>` | yes (run record carried) |
| `architecture`/`validation` | absent tool/config (precedent) | `no-op with a note` (unchanged) — the `NO-OP(<phase>):` token is **defined** as extensible to these, adopting it is an out-of-scope follow-up | via propose-gate-release note (ADR-082) |

The two judgment lines share the `NO-OP(<phase>):` token + kept idiom and the
"recorded, justified, carried-into-PR-body" shape — that *is* the first-class-and-symmetric requirement,
met by Edits 1–3 with no new mechanism.

## Decision candidates

These four were the load-bearing choices surfaced by the design; the user has now ratified all four in the
decisions phase. The design wording above has been revised against the ratified outcomes, and the
scope-fold rule fired on the one deviation (DC-2). Each settled candidate is one ADR:
**DC-1 → 100, DC-2 → 101, DC-3 → 102, DC-4 → 103**. Two were ratified as-recommended (DC-1/DC-3); DC-2 and
DC-4 were **overruled**. DC-2: the designer recommended "no ADR for adopted choices", the user ratified
"always ADR" (ADR-101). DC-4: the vocabulary was first ratified as option (a) — "per-phase idiom, shared
frame, no token" — then reconsidered and re-ratified as option (b), the fixed `NO-OP(<phase>):` token that
keeps each idiom after the prefix (ADR-103); the wording above is folded to that token form. Under the
DC-2 outcome, the adopt-without-escalation choices *inside* a future feature's decisions phase are
themselves authored as ADRs (marked adopted-as-recommended), just as these four phase-level forks are.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | **The adopt-vs-escalate threshold** in `decisions` — what distinguishes "clear recommendation → adopt" from "genuine fork → escalate". | (a) **clear-and-aligned**: adopt iff the recommendation is unambiguous AND aligns with an existing ADR or stated principle; else escalate. (b) **recommendation-exists**: adopt whenever the design states *any* recommendation; escalate only when it explicitly flags an open fork. (c) **always-escalate** (status quo): every candidate goes to the user. | **(a)** | Highest fidelity to the brief ("adopt clear recommendations *that align with existing ADRs/principles*") and to ADR-005's accountability ethos. (b) risks rubber-stamping under-justified recommendations; (c) is the asymmetry P19 removes. Default-to-escalate-when-in-doubt keeps user authority intact. |
| DC-2 | **ADR weight of adopted-without-escalation choices** — are they still authored as ADRs, or recorded more lightly? (Interacts with the renumbered decisions steps 4–6: interaction check / ADR authoring / scope-fold.) | (a) **lightly**: no ADR; the run-record no-op line names what was adopted + the aligning ADR/principle; only escalated forks (and design deviations) get ADRs. (b) **always ADR**: author an ADR per adopted choice too, marked "adopted-as-recommended, no user judgment". (c) **batch ADR**: one summary ADR listing all adopted choices. | designer recommended (a); **ratified (b)** → ADR-101 | The designer recommended (a) on the ground that an ADR records *user judgment*, of which an adopted choice has none. **The user overruled this and ratified (b):** every settled choice — ratified *and* adopted — is authored as its own ADR, adopted ones marked "adopted-as-recommended (no user judgment)", so the decision trail is complete and greppable regardless of escalation (ADR-101). (c) was rejected as a half-measure with unclear cross-link semantics. Edit 1's step 3 and the renumbered ADR-authoring step 5 are written to (b): adopted choices ARE authored as ADRs; the scope-fold rule is unaffected because an adopted choice still takes the recommendation as written. |
| DC-3 | **What "PR-body note" means** — is it just the run-record line carried into the body, or a dedicated explicit no-op bullet? | (a) **carried**: the existing run-record→PR-body flow (documentation step 3) suffices; no new bullet. (b) **dedicated bullet**: add an explicit "Phase no-ops:" line to the PR-body draft in `skills/documentation/SKILL.md` step 3. (c) **both**. | **(a)** | The brief notes the run-record line "already surfaces into the PR body". (a) is zero new surface and stays within the wording-only constraint without touching a third skill's *mechanism*. (b) adds a `documentation/SKILL.md` edit and a maintenance point for marginal gain; pick it only if field readers miss no-ops buried in the run record. |
| DC-4 | **Exact recorded phrasing/vocabulary per phase** so the two read symmetrically. | (a) **keep each phase's idiom, share the frame**: decisions = `no user-judgment decisions`; refactoring = its nothing-changed justification; both framed "first-class no-op, recorded + carried", no token. (b) **fixed token + kept idiom**: prefix both with `NO-OP(<phase>):` then the phase's existing idiom + justification — `NO-OP(decisions): no user-judgment decisions — …` / `NO-OP(refactoring): nothing cleared the bar — …`. (c) **fixed token, terse**: the token + free justification, dropping the idiom phrases. | first ratified (a), then **reversed to (b)** → ADR-103 | (a) was ratified first, then reconsidered: a per-phase idiom needs *both* phrases to find every no-op and an LLM reproduces an idiom less consistently than a literal token. **(b) was re-ratified as a superset of (a)** — the `NO-OP(<phase>):` token prefix carries the symmetry and makes one `grep -F 'NO-OP('` find all, while keeping each phase's idiom after the prefix so nothing already shipped is lost; the token is defined as extensible to `architecture`/`validation` later. (c) was rejected because it drops the shipped idiom phrasing. The wording above (brief, Requirement 4, Edits 1–3, the matrix) is folded to the (b) token form. |

## Test strategy

Docs-only phase; validation is a no-op for markdown (per [[adr/082-propose-gate-release-on-runtime-no-op]]'s
class of change and the P12 precedent). No `node --test` surface — these are skill-prose edits. Verification
is mechanical and textual:

- `git diff --stat` touches only `docs/` and `skills/{decisions,refactoring,run}/SKILL.md` — **no**
  `engine/`, no `contracts/`, no `pipeline` descriptor, no other skill.
- `skills/decisions/SKILL.md` contains an explicit adopt-without-escalation path and still escalates genuine
  forks; the cross-candidate check survives (renumbered), the ADR-authoring step authors every **settled**
  choice (ratified + adopted, adopted ones marked adopted-as-recommended), and the scope-fold rule survives
  (renumbered, still firing only on a deviation).
- `skills/refactoring/SKILL.md` step 2 names the run-record→PR-body carry and the decisions-symmetry; the
  "forbidden waste" and "silent skip not allowed" rules survive.
- `skills/run/SKILL.md` step 6 names a judgment no-op as a non-gap terminal outcome.
- Grep symmetry check: a single `grep -F 'NO-OP('` finds both judgment no-op lines — decisions'
  `NO-OP(decisions): no user-judgment decisions — …` (a *first-class outcome* clause, not only the
  zero-candidate skip) and refactoring's `NO-OP(refactoring): nothing cleared the bar — …` (which also
  references the PR-body carry).
- No provenance refs (phase/ADR/backlog numbers) leak into any place other than ADRs/this design doc — the
  skill edits carry none.

## Out of scope

- **Any engine / descriptor / contract change.** Hard constraint from the brief; if the wording-only path
  proved insufficient it would be a blocker, not a silent scope expansion. It is sufficient.
- **A `propose`-gate release for judgment no-ops.** `decisions`/`refactoring` are gate-less; ADR-082 already
  covers the only gated no-op (executing-harness). Nothing to release here.
- **Changing `architecture`/`validation` no-op wording.** Their "no-op with a note" is the *model* this
  design aligns to, not a target — left verbatim.
- **A `documentation`-phase PR-body edit** — only if DC-3 lands on (b)/(c); under the recommended (a) the
  existing run-record→PR-body flow carries the note untouched.
- **Reopening ADR-082 / the executing-harness no-op semantics** — P19 reuses that pattern; it does not revise it.
