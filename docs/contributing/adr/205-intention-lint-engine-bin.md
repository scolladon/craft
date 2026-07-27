# 205 — `intention-lint` lives in an engine bin, not the bash structure-lint family

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/intention-port.md · **Refines:** ADR-201, ADR-202

## Context

The deterministic form checks — `subjects:` frontmatter validity and `BACKLOG.md`
SoT-pointer resolution — gate in `ci.sh` from day one (ADR-202). The existing structure
lints (`design-lint.sh`, `backlog-lint.sh`, `docs-structure-lint.sh`) are bash/awk
scripts. Placing `intention-lint` there would keep the family consistent, but its logic
(YAML-frontmatter parsing + glob validity) is real branching logic, unlike the awk
section-presence checks — and craft's mutation-testing bar (Stryker over `engine/src/**`)
cannot reach an awk script.

## Options considered

1. **Engine bin: `engine/src/intention-lint-main.js` + a ~5-line `bin/` shim,
   mutation-tested** (recommended) — pros: the frontmatter/glob logic gets Stryker
   coverage; matches the manifest-lint/pipeline-lint engine-bin pattern / cons: breaks
   the visual consistency of the bash structure-lint family.
2. **Bash awk (design-lint.sh family)** — pros: consistent with the existing structure
   lints / cons: awk cannot cleanly parse YAML frontmatter, and the glob-matching logic
   gets zero mutation coverage.
3. **Fold the form checks into `assert-fresh`, run in CI** — pros: one code path / cons:
   conflates the advisory runtime verb with the day-one gating form check, which ADR-202
   deliberately keeps distinct.

## Decision

`intention-lint` ships as `engine/src/intention-lint-main.js` behind a thin
`engine/bin/intention-lint.js` shim, wired into `ci.sh`'s enumerate-and-run lint
sequence, and mutation-tested like the other engine lints. **Ratified by the user (this
run): the pattern deviation from the bash-lint family was surfaced as a genuine fork;
the user chose the engine bin for its mutation coverage.**

## Consequences

The structure-lint family is no longer uniformly bash — a documented, reasoned
exception. The frontmatter parser is shared with `engine/src/dod.js`'s Line-1 fail-loud
semantics rather than re-invented.
