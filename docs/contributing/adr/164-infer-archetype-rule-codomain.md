# 164 — inferArchetype rule table and {harness, construction} codomain

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/design/simpler-phase-authoring.md · **Supersedes/Refines:** none

## Context

The keystone behaviour. A new inserted phase that omits `archetype` must receive one by
inference. Archetype drives only execution topology — `applyProfileToArchetype`
(`profile.js`), the harness force-agent floor, and the `isExecutingHarness` tag
(`exec-harness.js`) — NOT the contract floor (the core contract is injected for every
phase unconditionally in `contract.js`; the named `contract` bundles are a separate field
that already defaults to `[]`). Therefore inference cannot weaken governance.

## Options considered

- (a) `{harness, construction}`, fallback `harness` (brief-pinned).
- (b) Add heuristics for `delivery`/`specification`.
- (c) A neutral non-archetype default (leave `undefined` flowing through).

## Decision

(a), user-ratified minimal. `inferArchetype(descriptor)`:

- has a `harness` block **or** a gate-command with no `produces` → `harness`
- `produces` non-empty → `construction`
- else → `harness` (conservative fallback = force-agent = most isolated)

Explicit `archetype:` always wins.

## Consequences

- Governance-invariant by construction: `inferArchetype` never reads or writes `contract`.
  A test asserts the contract block for an inferred phase equals that of the same phase
  with an explicit archetype.
- Combined with the already-defaulted `contract`/`consumes`/`produces`, the minimum
  new-phase descriptor collapses to `{ id, procedure, gate, after }`.
- (b) guesses author intent and risks the wrong topology; (c) leaves `archetype: undefined`
  flowing through — the silent status quo this change removes.
