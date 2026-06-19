# 075 — Registered-profile validation: full + typed

- **Status:** accepted
- **Date:** 2026-06-19
- **Design:** docs/DESIGN-P14-derived-plugin-extension.md · **Supersedes/Refines:** none (DC-7 as recommended)

## Context

`extends.profiles` registers whole-flow execution modes selectable by `pipeline.profile`, expanding to a
per-archetype `inline|agent` map (the harness-archetype `agent` floor is re-forced regardless —
`profile.js`). A profile is a whole-flow contract; the question is how strictly `validateManifest`
checks a registered one.

## Options considered

1. **Require all six archetype keys, each value ∈ `{inline, agent}`** — pro: an incomplete profile
   fails loud; no silent gaps / con: more to declare. *(designer's recommendation)*
2. **Allow partial maps (missing archetype → `agent` default)** — con: silently agent-defaults a phase
   the author forgot; surprising.
3. **Defer profile registration to a follow-up** — con: PRD §12 names profiles explicitly; cutting
   needs sign-off.

## Decision

A registered profile must declare **all six archetypes** (`setup`, `specification`, `construction`,
`harness`, `refinement`, `delivery`), each valued `inline` or `agent`; a missing archetype or an
off-vocabulary value is a loud `ok:false`. The harness-archetype `agent` floor is still re-forced at
expansion (a profile cannot inline a harness phase), independent of what the map declares.

## Consequences

- `validateExtendsProfiles` enforces the full typed shape; an incomplete or mistyped profile is caught
  at lint, before resolution.
- No silent agent-defaulting: an author sees exactly which archetypes a registered profile sets.
- Profile registration ships in P14 (not deferred); the harness-floor re-forcing keeps the invariant
  intact regardless of a registered profile's map.
