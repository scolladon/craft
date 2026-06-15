# 006 — `contract:` field is a list, defaulting to one

- **Status:** accepted
- **Date:** 2026-06-15
- **Design:** docs/DESIGN-customizable-engine.md · **Supersedes/Refines:** none

## Context

A phase may need more than one contract bundle (e.g. an artifact producer that also emits
structured output). The descriptor's `contract:` field selects which engine bundle(s) inject.

## Options considered

1. **List, defaults to one** — `contract: [producer, harness-read]`; composition, closed
   vocabulary / slightly more parsing. *(recommended)*
2. **Single bundle name** — simplest / a phase can't compose two bundles.
3. **Free-form contract file per phase** — max flexibility / re-opens the "contract can
   diverge/be dropped" risk P5 exists to close.

## Decision

`contract:` is a **list of bundle names** (a bare string is sugar for a one-element list). The
universal core (`core`) is always implicit. The vocabulary is **closed** and validated by the
Node core (ADR-002).

## Consequences

Phases compose bundles without a combinatorial bundle explosion. The validator rejects unknown
bundle names. Pairs with ADR-003 (fragment files are the bundles).
