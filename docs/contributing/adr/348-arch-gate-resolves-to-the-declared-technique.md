# 348 — `<arch gate>` resolves to the declared technique's own run

- **Status:** accepted
- **Date:** 2026-08-07
- **Design:** docs/contributing/design/harness-hygiene-followups.md · **Supersedes/Refines:** supersedes ADR-050

## Context

ADR-347 enables the `architecture` phase, so its `gate: <arch gate>` placeholder must
resolve to something executable.

ADR-050 (2026-06-18) pinned `<arch gate>` to "dependency-cruiser exits 0 over the scope".
That predates ADR-149's de-specialization, which made techniques repo-declared and the
engine technique-agnostic. It is also the last dependency-cruiser reference in an accepted
ADR, and it names a tool that `test/source-hygiene.test.js:26` bans from plugin sources —
a documented intention no code in this repo can honour.

Not all of ADR-050 is stale. Its report/exception decisions — the violation report lives in
the run record with no committed report file, and a deliberate exception is encoded once,
never by weakening a rule wholesale — remain correct and tool-independent.

## Options considered

1. **Supersede ADR-050 with a new ADR**: `<arch gate>` resolves to the declared technique's
   own `run` exiting 0 — pros: consistent with ADR-149; no new dependency; carries forward
   the parts of ADR-050 that are still right / cons: supersedes an accepted ADR.
   *(designer's recommendation)*
2. **Keep ADR-050 and adopt dependency-cruiser as a devDependency** — pros: honours the
   existing decision literally / cons: adds the repo's first non-`js-yaml` dependency and a
   supply-chain decision, for a rule three greps express; and the tool is banned from
   plugin sources.
3. **Leave ADR-050 and the placeholder untouched** — pros: nothing to write / cons: leaves
   an accepted ADR describing a banned tool — the exact class of drift this change closes.

## Decision

ADR-050 is **superseded**. `<arch gate>` resolves to **the declared `architecture`
technique's own `run` command exiting 0** over the phase's scope — the same
technique-agnostic shape `<validation gate>` already has under ADR-149. The engine names no
tool.

Carried forward from ADR-050, unchanged and now stated tool-independently:

- The violation report lives in the **run record**; no committed report file, and no
  `docs/architecture/` directory.
- A deliberate, justified exception is encoded **once, in the technique's own rule
  expression**, with one line of why — never by weakening a rule wholesale.
- `craft:harness-triager`'s per-violation contract stands: FIXED (edge removed under gate) /
  EXCEPTION (scoped override + one-line proof) / FALSE (mis-report) / blocker.

Superseded from ADR-050: every mention of dependency-cruiser as the gate, the exception
home, or the report producer.

## Consequences

- With ADR-347's `boundaries` technique declared, `<arch gate>` is
  `node --test test/architecture-boundaries.test.js` exiting 0 — a concrete command, from
  the manifest, not the engine.
- A repo that declares a different `architecture` technique gets its own gate with no
  engine change.
- ADR-050's status becomes `superseded by ADR-348`; its file stays for the history.
- No dependency-cruiser reference remains in an accepted ADR, so
  `test/source-hygiene.test.js:26`'s ban no longer contradicts the decision log.
