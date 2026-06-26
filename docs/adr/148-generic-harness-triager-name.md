# 148 — One generic `harness-triager` replaces the two technique triagers

- **Status:** accepted
- **Date:** 2026-06-25
- **Design:** docs/design/despecialize-craft-sources.md · **Supersedes/Refines:** none

## Context

De-specializing the executing-harness collapses `validation` and `architecture` onto one
mechanism, so their two triager agents (`agents/validation-triager.md`,
`agents/architecture-triager.md`) become one generic triager parameterised by the
technique's own triage procedure (consumer config). The brief's wording was
"findings-triager", but `findings` is already a review-phase memory concern
(`engine/src/memory.js`), so the literal name risks conceptual collision.

## Options considered

1. **`harness-triager`** *(designer recommendation)* — pros: names the archetype it serves; no collision with the review `findings` concern. Cons: deviates from the brief's literal word.
2. **`findings-triager`** — pros: matches the brief verbatim. Cons: collides conceptually with the `findings` memory concern review writes.
3. **Keep two triagers sharing a body** — pros: smallest rename. Cons: contradicts the brief's "one generic triager".

## Decision

*User judgment.* Name the merged agent **`harness-triager`**. It replaces both
`validation-triager` and `architecture-triager`; its body is technique-neutral and the
technique-specific triage vocabulary lives in the technique's `triage-procedure` ref
(consumer config), injected verbatim at spawn. `MODELS_KEYS` migrates
`validation-triager` → `harness-triager` (and the `manifest.js` renamed-agent-model
deprecation hint retargets); `architecture-triager` was never a `MODELS_KEYS` member, so
that asymmetry disappears.

## Consequences

- Two agent files (`validation-triager.md`, `architecture-triager.md`) become one
  (`harness-triager.md`); the pipeline `role:` of both harness phases points at it.
- `MODELS_KEYS` and the deprecation hint update; a fixture testing the old rename stays
  (frozen) or gains the new target.
- The review `findings` memory concern is untouched and unambiguous.
