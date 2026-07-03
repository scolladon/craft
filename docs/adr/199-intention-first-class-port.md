# 199 — Intention documentation is a first-class port

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/intention-port.md · **Supersedes/Refines:** none

## Context

Architectural intention (the living architecture doc, the port specs, the DOD, the
GUIDE) aggregates in four places, is guarded in none for freshness or coverage, and is
fed/consulted through prose convention only. The genericity requirement is hard: a
project must configure its own intention backend (in-repo markdown, RAG, external wiki,
code-graph) with near-zero ceremony. Only a port — an engine-owned invariant over a
swappable adapter — delivers that, the same split already proven for backlog and memory.

## Options considered

1. **First-class port + `docs/adapters/intention.md`** (recommended) — pros: same
   second-instantiation-proven split as backlog/memory; genericity falls out of the
   adapter seam / cons: a ninth port to maintain.
2. **Fold into the memory port** — pros: no new port / cons: breaks the memory port's
   content whitelist, which deliberately bans semantic/architectural prose.
3. **No port — lints + prose only** — pros: least machinery / cons: guards the default
   but forfeits pluggability, failing the hard genericity requirement.

## Decision

Intention documentation is a first-class port with spec `docs/adapters/intention.md`.
The engine owns the invariant — intention is recorded at the seams that produce it,
consulted at the seams that need it, and its living pages are kept demonstrably fresh —
while the adapter owns storage and retrieval. **Adopted as recommended (no user
judgment): endorsed in the pre-run design conversation.**

## Consequences

Commits craft to a ninth port and its spec doc. The memory port stays a sibling (its
whitelist ban on semantic prose is preserved). The default adapter must be fully
specified so a no-manifest repo still works (see the subjects/verb/lint ADRs).
