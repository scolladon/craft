# 060 — `file` id-form stays orchestrator prose-judgment (no engine regex)

- **Status:** accepted
- **Date:** 2026-06-18
- **Design:** docs/DESIGN-P11-backlog-port.md · **Supersedes/Refines:** none

## Context

The core owns "which id-form is a backlog id" (SP6 hexagonal split). For `custom`, the id-form
is the script's concern. For `file`, SP6 offered `^\d+(\.\d+)+$` as an *example* — but this
repo's own `BACKLOG.md` keys by `P<n>` / free-text labels, which that regex would mis-classify.
So "the core owns the id-form" must not mean shipping one universal regex.

## Options considered

1. **Keep prose-judgment** — `run/SKILL.md` step 2 classifies a `file` id by the repo's backlog
   convention; no engine regex. pros: no scored-surface growth; cannot mis-classify a repo whose
   convention differs (incl. craft's own) / cons: not machine-enforced. *(designer's
   recommendation)*
2. **Manifest knob `backlog.id-pattern`** — a per-repo regex the validator/record carries
   (default the SP6 dotted-numeric). pros: real per-repo flexibility / cons: expands the
   mutation-scored surface for one source.
3. **Hardcode the SP6 regex** — cons: provably wrong here; mis-classifies craft's own backlog.

## Decision

The `file` source's id-form stays **orchestrator prose-judgment** — `run/SKILL.md` step 2
classifies an input as a `file` backlog id by the repo's own backlog convention, with **no
hardcoded engine regex** and no manifest id-pattern knob. The `custom` source delegates id-form
entirely to its resolver script. The engine's only id-related job stays config validation
(shape + source), per [[054-backlog-manifest-object-shape]] / [[055-backlog-two-source-model]].

## Consequences

- No `backlog.id-pattern` field; no regex in `engine/src/**` for backlog id-forms — the scored
  core stays tiny.
- `docs/adapters/backlog.md` documents that `file` id-classification follows the repo
  convention (prose), and `custom` id-forms are the script's concern.
- If a future repo needs machine-enforced `file` id-matching, option 2 (the manifest knob) is
  the pre-analysed upgrade path — deliberately deferred, not foreclosed.
