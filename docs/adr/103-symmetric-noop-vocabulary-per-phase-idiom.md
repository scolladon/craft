# 103 — Judgment-phase no-ops use a fixed `NO-OP(<phase>):` token prefix, keeping each phase's idiom

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P19-noop-first-class-phase-outcome.md · **Supersedes/Refines:** none

## Context

The two judgment phases (`decisions`, `refactoring`) must read symmetrically AND be reliably found when
a reader — human or a future craft run — scans the run record or PR body for a no-op. The recorded
vocabulary was first ratified as "per-phase idiom, shared frame" (no token), but reconsidered: a
per-phase idiom means finding all no-ops requires knowing *both* phrases, and an LLM reproduces an idiom
less consistently than a literal token. The forces are grep-stability and consistent emission versus
churn to already-shipped phrasing.

## Options considered

1. **Per-phase idiom, shared frame (no token)** — `decisions` keeps "no user-judgment decisions",
   `refactoring` keeps its nothing-changed justification, symmetry via shared shape only.
   *(designer's original recommendation; initially ratified, then reconsidered)* — pros: zero churn /
   cons: no single grep; two phrases to know; weaker model recall.
2. **Fixed token + kept idiom** — a fixed `NO-OP(<phase>):` prefix followed by the phase's existing
   idiom + justification. *(ratified)* — pros: one grep finds all; literal token reproduced reliably;
   extensible to other phases; **no phrasing loss** / cons: introduces a token the run record does not
   yet use elsewhere.
3. **Fixed token, terse** — token + free justification, dropping the idiom phrases — cons: loses the
   already-shipped phrasing.

## Decision

Judgment-phase no-ops are recorded with a fixed, greppable prefix **`NO-OP(<phase>):`** followed by the
phase's existing idiom and a 1–3 line justification:

- `NO-OP(decisions): no user-judgment decisions — <adopt/align justification>`
- `NO-OP(refactoring): nothing cleared the bar — <what was considered / why nothing changed>`

The **token** carries the symmetry; each phase keeps its idiom after it, so nothing already shipped is
lost. The token is defined as `NO-OP(<phase>):` so `architecture`/`validation` (today "no-op with a
note") can adopt the same shape in a follow-up; this change applies it only to the two judgment phases.

## Consequences

- A single `grep -F 'NO-OP('` finds every judgment-phase no-op across run records and PR bodies — the
  "recorded, auditable" intent made mechanical (the ADR-082 ethos: mechanism over memory).
- The shipped `no user-judgment decisions` phrase and `refactoring`'s justification idiom are preserved
  after the prefix; no phrasing churn.
- The design's recorded-vocabulary matrix and the Edit 1 / Edit 2 skill wording use the token.
- Extending `NO-OP(<phase>):` to `architecture`/`validation` is an optional follow-up, out of this
  change's scope — the token is already defined to make that a drop-in.
