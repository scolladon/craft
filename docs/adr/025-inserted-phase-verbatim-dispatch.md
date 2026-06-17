# 025 — Inserted-phase dispatch: verbatim `phase.procedure` (P7/P14 boundary)

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P7-pipeline-editing.md · **Supersedes/Refines:** none (draws the P7/P14 line)

## Context

The walk (`run/SKILL.md` step 1) invokes `forge:<phase.id>` and STOPs with "unknown phase id"
when no `skills/<id>/` dir exists. For a *default* phase, `phase.id` == skill dir == the skill.
An **inserted** phase (e.g. S3's `bench`) has no `skills/bench/` dir but carries
`procedure: forge:bench` (or a namespaced `acme:bench`) and a `role:`. So the walk must stop
assuming `forge:<id>`. The question is not *whether* to dispatch `phase.procedure` — that seam is
forced — but **how far P7 tests and what it promises** for the three flavors a `procedure:` can
take: ① an existing forge skill, ② a not-yet-existing forge skill, ③ a namespaced skill from a
derived plugin (SP2-proven cross-plugin dispatch; the `forge.extends:` registration surface is
explicitly P14).

## Options considered

1. **Forge-local now, namespaced→P14** — test ① end-to-end; document ③ as P7/P14 boundary.
2. **Namespaced dispatch now too** — also test ③ end-to-end. *Rejected:* pulls P14's derived-plugin
   machinery (a test plugin in CI, the registration story) forward and advertises an unproven
   surface (PRD §17 sequencing: "the catalog never advertises an unproven surface").
3. **Forge-local only, no namespaced prose** — silent on ③. *Rejected:* leaves a mismatch — S7
   already accepts `acme:` ids at the resolution layer, but the walk would not mention them.

## Decision

The walk dispatches **`phase.procedure` verbatim — namespace-agnostic, no restriction.** To the
dispatch line, `forge:bench` and `acme:bench` are identical strings; if the named skill/plugin is
not installed → loud STOP "procedure `<phase.procedure>` resolves to no installed skill". This is
*less* code than a `forge:`-only guard, not more — restricting would mean adding a check to remove
capability. P5's engine-owned contract is injected around **whatever** procedure runs, so a
namespaced procedure **cannot** drop the contract (the G5 promise holds across the boundary). P7
**tests** the dispatch-target computation (target = `phase.procedure`, namespace-agnostic) and
**documents** that namespaced procedures dispatch via cross-plugin (SP2, proven). P7 does **not**
build the `forge.extends:` registration surface or an installed-derived-plugin end-to-end run —
those stay **P14**.

## Consequences

A user can insert a phase reusing an existing forge skill (e.g. a second `forge:review`) and it
runs today; a brand-new behavior needs a forge-local skill dir now, or a derived plugin once P14
ships registration. The walk gains one generic capability (dispatch `procedure`); only the
heavyweight registration machinery + its end-to-end proof are deferred — so the boundary documents
a *proven* dispatch and defers an *unproven registration UX*, not vapor. The `run/SKILL.md` step-1
prose and the "Walk error paths" table change; the "unknown phase id" STOP becomes the
"procedure resolves to no installed skill" STOP.
