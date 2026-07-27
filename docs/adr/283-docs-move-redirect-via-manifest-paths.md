# 283 — docs move redirects via manifest paths, shipped defaults unchanged

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** ../design/docs-audience-split.md · **Supersedes/Refines:** none

## Context

The audience split moves craft's pipeline-written trees (`design/`, `adr/`, `plan/`,
`DOD.md`) under `docs/contributing/`. Phase skills fall back to `docs/*` defaults when a
manifest declares no `paths.*` key, so either the shipped defaults change (affecting every
consumer repo) or craft redirects only itself.

## Options considered

1. **Craft's `.claude/workflow.md` declares `paths.*` overrides; shipped skill defaults
   unchanged** *(recommended)* — pros: consumer repos untouched, craft eats its own
   config surface / cons: craft's manifest grows a block.
2. **Change engine/skill defaults to `contributing/` paths** — pros: no override needed /
   cons: churns every downstream repo for craft's private reorg.
3. **Hybrid (change some defaults, override the rest)** — pros: none clear / cons: two
   mechanisms for one concern.

## Decision

Adopted-as-recommended (no user judgment; the target structure the user ratified already
named the manifest-`paths.*` mechanism). Craft's own manifest declares `paths.design`,
`paths.adr`, `paths.plan`, `paths.dod` pointing at `docs/contributing/…`; shipped skill
defaults stay `docs/*`.

## Consequences

Craft behaves as any consumer of its own engine — repo-local layout is repo-local config.
Skill-internal citations of craft's *own* spec docs are literals to sweep, not defaults to
change. If the requirements phase is ever enabled, `paths.requirements` must be added
alongside the audience-split guard's allowlist.
