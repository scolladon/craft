---
name: prune
description: Inspect the harness surface for drag the current model no longer needs and propose prune candidates for human review — never deletes or edits anything itself. Triggers — "craft:prune", "harness prune review", "prune the harness", "delete the harness against the new model".
argument-hint: []
---

# craft:prune — standing harness-prune review

Standalone, session-owned skill, invoked on demand. It is **not** a pipeline phase — it is
not part of the default pipeline and never runs unless a session explicitly invokes it. An
uninvoked skill is inert: zero drag, nothing to revert, nothing to maintain against a run
that never happens.

This skill is ADVISORY and **read-only**: it writes no harness file. Its only output is a
proposal a human reviews. A run that finds nothing to propose is a recorded no-op, never a
blocker.

Input: `$ARGUMENTS` (zero-argument).

---

## Preamble — read the denylist first, fail closed

Before inspecting anything else, read `contracts/core.md`. It is the undroppable-core
denylist every later candidate is checked against.

- **Fail-closed.** If `contracts/core.md` cannot be read, stop here and emit **no**
  proposals. Never fall back to an empty denylist and propose against it — an unreadable
  denylist is a hard stop, not a green light.
- The same refusal covers the non-overridable cross-phase invariants documented alongside
  the core contract: a candidate mapping to either is refused before it is ever emitted, not
  merely flagged after the fact.

## Inspection scope

Read-only, over exactly these paths:

- `contracts/*.md` — the invariant floors, read both as the denylist source and as
  inspection material (a floor can also restate itself redundantly across files).
- The lint set — `scripts/*-lint.sh`, `engine/bin/*-lint.js`, and the `engine/src` modules
  those bins import.
- Skill and agent prose — `skills/**`, `agents/**`.

Resolve the current model identity from the run context; when the run context does not
carry it, read `docs/guides/model-class-matrix.md`. Flag drag the resolved model no longer needs:
belt-and-braces guidance that duplicates behaviour the model already carries natively, a
lint superseded by a newer mechanism, or prose restating what the model now does without
being told.

**Rule-vs-fact.** A unit that encodes a *decision procedure* the model can already run,
where stating one missing *fact* would suffice. The candidate's replacement is the fact
itself, stated once, at the place the procedure lived.

These two questions are orthogonal: the first asks whether the guidance is needed at all;
this one asks whether guidance is the right *shape* for what it carries. A unit can fail
the second and pass the first.

## Output — a proposal, never an action

The only output is a structured list. Each candidate carries three fields: `unit` (the file
or section proposed for removal), `rationale` (why the current model no longer needs it),
and `what-would-replace-the-safety-it-provided` (what covers the gap if it is dropped — "the
model's native behaviour," "a newer lint," or "nothing — flag as a genuine regression risk,
not a candidate," when nothing would).

Emit each surviving candidate as one greppable line:

```
PRUNE-CANDIDATE(<unit>): <rationale>
```

For a rule-vs-fact candidate, the rationale carries a fixed prefix so the two classes stay
greppable apart — no new token, the same `PRUNE-CANDIDATE(<unit>):` line, a distinguishing
rationale prefix only:

```
PRUNE-CANDIDATE(<unit>): rule-vs-fact — <rationale>
```

The three-field candidate shape is unchanged; for a rule-vs-fact candidate the existing
third field (`what-would-replace-the-safety-it-provided`) carries the missing fact.

This token is defined **here only**. It does not join the `skills/run/SKILL.md` token
family, and no other skill or script emits it.

## Procedure

1. Read `contracts/core.md`. Unreadable → report the read failure and stop; emit no
   proposals (fail-closed — see Preamble).
2. Resolve the current model identity (run context, else `docs/guides/model-class-matrix.md`).
3. Walk the inspection scope. For each unit that looks like drag against the resolved
   model, or that encodes a decision procedure a stated fact would replace, draft a
   candidate with the three fields above.
4. Check every drafted candidate against the denylist read in step 1, **identically for
   both classes**: a rule-vs-fact candidate mapping to a core invariant is dropped before
   emission, exactly as a drag candidate is. A candidate mapping to a core invariant, or to
   a non-overridable cross-phase invariant, is refused — drop it; it is never emitted.
5. Emit the surviving candidates as `PRUNE-CANDIDATE(<unit>): <rationale>` lines, and as
   `PRUNE-CANDIDATE(<unit>): rule-vs-fact — <rationale>` lines for the rule-vs-fact class.
6. Report the list to the user for ratification. Delete or edit nothing.

### Enacting an approved prune

This skill proposes only. A candidate the user approves is enacted through a normal craft
feature run (design through validation), where the harness's existing gates —
`contracts-lint`, `source-hygiene`, the DoD lints, and the repo's validation techniques
already wired into `ci.sh` — protect the core exactly as they would for any other change.
This skill itself never deletes or edits a harness file.

## Trigger

Manual and documented here — the ratified floor. There is no auto-detection of a model
change, no cadence timer, and no new pipeline phase. A session runs this skill by name when
a human decides a review is warranted — for example, after a run deliberately records a new
model class in `docs/guides/model-class-matrix.md`.

---

## Error semantics

| Condition | Behaviour |
|---|---|
| `contracts/core.md` unreadable | Fail-closed: stop, emit no proposals, report the read failure — never propose against an empty denylist |
| Inspection scope quiet (no drag found) | Recorded no-op: report zero candidates; never a blocker |
| A drafted candidate maps to a core or cross-phase invariant | Refused before emission — dropped from the list, not merely flagged |
| Skill not invoked this session | Inert: no run, zero drag, nothing to report |
