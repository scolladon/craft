# 277 — Finding status: leading colon-suffixed token + optional JSON key

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-07-25
- **Design:** docs/design/sp9-findings-adoption.md · **Supersedes/Refines:** none

## Context

The canonical `Finding` gains an optional claim `status` over
`{VERIFIED, SUSPECT, RULED-OUT, PROBE}`. Both wire shapes the normalizer accepts (JSON
array and per-line list) must carry it without breaking a single existing status-less
reviewer line or fixture.

## Options considered

1. **Leading colon-suffixed token peeled before the unchanged head pattern; optional JSON
   `status` key** *(recommended)* — pros: mirrors optional-`fix` handling and the
   deliberation `REFINED-STATE` vocabulary; disjoint status/severity vocabularies keep old
   lines parsing byte-for-byte / cons: one extra anchored regex in the per-line path.
2. **Trailing status column after finding/fix** — pros: no prefix peel / cons: collides
   with the existing pipe-splitting of `fix`, ambiguous for status-less lines.
3. **Keep `status` out of the canonical `Finding`, prose-only in `REFINED-STATE`** — pros:
   zero engine change / cons: the normalized list convergence threads could never express
   `RULED-OUT`, defeating the feature.

## Decision

Option 1. Per-line: optional `<STATUS>: ` prefix (`RULED-OUT: HIGH file:line — …`) peeled
by a separate anchored regex before the unchanged `LINE_HEAD_PATTERN`; JSON: optional
`status` key. Absent → the key is omitted, exactly like `fix`. Canonical key order pinned
as `file, line, severity, finding, fix?, status?`.

## Consequences

Backward compatibility is total (old lines never see the new token). The fixed greppable
`TOKEN:` convention extends to findings. R10 field-keyed interchangeability now covers
`status`; both shapes must normalize deeply equal.
