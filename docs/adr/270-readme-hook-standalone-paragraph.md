# 270 — README mental-model hook is a standalone paragraph, not a new section

- **Status:** accepted
- **Date:** 2026-07-24
- **Design:** docs/design/communication-revamp-four-frames.md · **Supersedes/Refines:** none

## Context

The ratified placement gives README a short mental-model hook linking
`docs/GUIDE-concepts.md` after the *Why craft* bullets. The remaining choice is its form:
README's heading rhythm (Why → Install → Use → Customize → Layout) is part of its
front-door economy.

## Options considered

1. **Standalone 3–4 line paragraph, no new heading** (designer's recommendation) — pros:
   lightweight pointer; preserves heading rhythm / cons: not directly linkable by anchor.
2. **New `## The mental model` H2** — cons: a heading competing with the guide it points
   to; grows the front door.
3. **Fold a sentence into the *Customize* pointer** — cons: buries orientation inside a
   task pointer; the two answer different questions.

## Decision

**Adopted-as-recommended (no user judgment).** Option 1: a standalone paragraph directly
after the *Why craft* bullets.

## Consequences

README stays a front door; the guide owns the narrative. If the hook ever needs an
anchor, promoting it to a heading is a trivial, isolated edit.
