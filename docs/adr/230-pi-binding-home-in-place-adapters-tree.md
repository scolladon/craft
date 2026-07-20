# 230 — the native pi binding extends `adapters/pi/` in place as a pi package

- **Status:** accepted
- **Date:** 2026-07-19
- **Design:** docs/design/native-pi-binding.md · **Supersedes/Refines:** Refines ADR-085, mirrors ADR-215

## Context

The headless `craft-pi` bin already lives under `adapters/pi/` (ADR-085's top-level adapter tree). The native surface can extend that tree, live in a sibling `adapters/pi-native/`, or be published as a separate package. pi's local-path install (`pi install ./adapters/pi`, design §D2 row 5) adds the path to settings **without copying**, so an in-place layout needs no build/emit step.

## Options considered

1. **Extend `adapters/pi/` in place + a `package.json` `pi` manifest so `pi install ./adapters/pi` works** *(designer recommendation)* — pros: ADR-085 home; local-path-install-without-copy means no second release surface; the headless bin and native surface share one tree. Cons: one tree carries both the subprocess bin and the native resources.
2. **Sibling `adapters/pi-native/`** — cons: splits one binding across two trees.
3. **Separately-published `@craft/pi` npm/git package** — cons: a second release surface and version-skew risk.

## Decision

*Adopted as recommended (no user judgment).* Option 1, aligned with ADR-085 and the opencode precedent (ADR-215). The native pi resources (prompts/, skills exposure, extensions/, settings template, README) extend `adapters/pi/` in place; `adapters/pi/package.json` gains a `pi` manifest and `keywords:["pi-package"]` so `pi install ./adapters/pi` (or `-l` for project scope) registers all resource kinds with no copy step.

## Consequences

- One binding, one tree; the headless bin (`run.js`/`cli.js`) and the native surface coexist additively.
- No build/emit: local-path install references the repo layout directly.
- Engine core stays untouched (ADR-085); the only sanctioned engine touch is the telemetry sibling + generic selector (ADR-233/238).
