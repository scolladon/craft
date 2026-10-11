---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: centralise-region-slicer
      commit: 0d9e8ea
      date: '2026-10-11'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix engine test
    confidence: 4
    provenance:
      run: scrub-home-dir-from-docs
      commit: ee287dd
      date: '2026-10-11'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: centralise-region-slicer
      commit: 0d9e8ea
      date: '2026-10-11'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 1
    provenance:
      run: transient-model-retry
      commit: 58091c5
      date: '2026-10-11'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: scrub-home-dir-from-docs
      commit: ee287dd
      date: '2026-10-11'
  - concern: part-sizing
    size: test-guard
    outcome: pass
    confidence: 2
    provenance:
      run: centralise-region-slicer
      commit: 0d9e8ea
      date: '2026-10-11'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 0d9e8ea / 2026-10-11

## gate-cmd
- confidence: 4 | provenance: ee287dd / 2026-10-11
- confidence: 5 | provenance: 0d9e8ea / 2026-10-11

## validation-tool
- confidence: 1 | provenance: 58091c5 / 2026-10-11

## findings
_(none)_

## part-sizing
- confidence: 4 | provenance: ee287dd / 2026-10-11
- confidence: 2 | provenance: 0d9e8ea / 2026-10-11
