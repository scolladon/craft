# 069 — Derived-plugin registration key: flat top-level `extends:`

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P14-derived-plugin-extension.md · **Supersedes/Refines:** none (DC-1 as recommended)

## Context

P14 ships the Tier-2 registration surface: a derived plugin's phases/agents/profiles/backlog-adapters
declared in the repo manifest `.claude/workflow.md` (a plugin cannot read another plugin's files —
SP2 — so the descriptor data is manifest-carried). The manifest validator keys on a closed flat
`TOP_KEYS` allow-set of bare keys (`backlog`, `pipeline`, `phases`, …). The PRD §12 sample writes the
surface as `craft.extends:`, which reads three ways: a flat key spelled with a dot, a literal dotted
YAML path, or a nested object.

## Options considered

1. **Flat `extends:`** — pro: matches the existing flat `TOP_KEYS` schema; no dotted-key parsing; the
   file is already craft's own so a `craft.` prefix is redundant / con: diverges from the PRD's literal
   wording. *(designer's recommendation)*
2. **`craft.extends:` dotted single key** — pro: matches PRD §12 wording literally / con: introduces a
   dotted-key form nothing else in the schema uses.
3. **Nested `craft: { extends: {…} }`** — pro: namespaces the surface / con: adds a nesting level the
   rest of the schema avoids; most verbose.

## Decision

The registration block is a **flat top-level `extends:`** key, added to `TOP_KEYS`. PRD §12's
`craft.extends:` is read as prose ("the extends surface of craft"), not a literal YAML key; flat
`extends:` satisfies the intent while staying consistent with every other manifest key.

## Consequences

- One new entry in `TOP_KEYS`; `validateExtends` dispatches from the existing `validateManifest`
  switch. No dotted-key or nested-object parsing is introduced.
- All P14 docs, examples, and the Tier-2 catalog spell the key `extends:`.
- If a future surface needs craft-namespacing, that is a separate schema decision; P14 does not open it.
