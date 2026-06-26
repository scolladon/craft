# 152 — Neutralize both README and GUIDE-customizing, not just the brief's explicit list

- **Status:** accepted
- **Date:** 2026-06-25
- **Design:** docs/design/despecialize-craft-sources.md · **Supersedes/Refines:** none

## Context

The brief's explicit must-be-agnostic list names `docs/DOD.md` and
`docs/GUIDE-customizing.md` but not `README.md`. `README.md` currently presents mutation
and dependency-cruiser as built-in defaults, and the GUIDE names them as phase defaults.

## Options considered

1. **Neutralize both README + GUIDE** *(designer recommendation)* — pros: README is phase-defining prose a consumer reads first; the principle ("no engine/phase-defining source names a technique") covers it even though it is not enumerated. Prose-only, low risk. Cons: extends scope past the brief's literal list.
2. **GUIDE only** — pros: strictly within the brief's enumeration. Cons: leaves a technique/vendor name in the top-level doc, contradicting the principle.

## Decision

*User judgment.* Neutralize **both** `README.md` and `docs/GUIDE-customizing.md`: technique
names (mutation/dependency-cruiser) and the VCS-host CLI (`gh`) are removed from harness
and delivery descriptions and replaced with technique-neutral language pointing to
`examples/` for the optional presets. The Backlog-port `gh`/`jira`/`linear` adapter-recipe
labels stay (separate port concern — see ADR for harness/delivery scope and design Out-of-scope).

## Consequences

- README harness/delivery prose becomes technique-neutral; the one-line on-ramp survives
  as an `examples/` pointer.
- The GUIDE `--harness` coercion table drops the `tool` row and adds a `techniques` row.
- The source-hygiene grep gate includes `README.md` in its scanned set.
