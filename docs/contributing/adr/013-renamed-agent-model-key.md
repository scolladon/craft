# 013 — Renamed agent-name in `models.<agent>` is rejected loudly, not aliased

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-customizable-engine.md · **Refines:** ADR-004 (alias home), ADR-011 (fail-loud)

## Context

P4 renames the `mutation-triager` agent to `validation-triager`, so `validateManifest`'s
`MODELS_KEYS` set must move to the new name. A committed manifest may still carry
`models.mutation-triager`. The shared `ALIAS_MAP` (ADR-004) resolves **phase** names only —
agent/role names live in a different namespace. The question: does the old agent key keep
validating (an agent-name alias), or is it refused?

## Options considered

1. **Reject loudly + migration guidance** — `models.mutation-triager` → exit-2 error that names
   the new key; `ALIAS_MAP` stays phase-only (DC-4); manifests update one key. *(user choice)*
2. **Alias the old agent name** — resolve `mutation-triager → validation-triager` inside
   `validateModels` so old manifests keep validating. Back-compat, but introduces a second
   alias notion (agent names) beyond the phase-only `ALIAS_MAP` — drift surface DC-4 exists to
   prevent.

## Decision

A renamed agent key in `models.<agent>` is **refused** with a targeted message
(`models key 'mutation-triager' was renamed — use 'validation-triager'`), not resolved. The
shared `ALIAS_MAP` remains the single, **phase-only** alias home (DC-4). This matches the
fail-loud stance of ADR-011 (legacy per-phase `skip:` is rejected with guidance, not silently
honored): a misconfigured declination fails loudly with a fix, never silently.

## Consequences

`MODELS_KEYS` lists `validation-triager`; the one renamed key is special-cased to emit guidance
rather than the generic `unknown models key` error. No agent-alias map is introduced, so there is
nothing to keep in sync with the phase map. Future agent renames follow the same pattern (a
targeted guidance line), or motivate a dedicated agent-alias mechanism if they become frequent —
explicitly out of scope here. A repo on the old key updates one line in `.claude/workflow.md`.
