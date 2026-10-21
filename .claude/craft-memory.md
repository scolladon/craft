---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: per-line-over-range-line
      commit: bf86ba4
      date: '2026-10-21'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: per-line-over-range-line
      commit: bf86ba4
      date: '2026-10-21'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: per-line-over-range-line
      commit: bf86ba4
      date: '2026-10-21'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 5
    provenance:
      run: per-line-over-range-line
      commit: bf86ba4
      date: '2026-10-21'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 3
    provenance:
      run: reviewer-findings-shape-mismatch
      commit: 03a4166
      date: '2026-10-21'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 3
    provenance:
      run: per-line-over-range-line
      commit: bf86ba4
      date: '2026-10-21'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: bf86ba4 / 2026-10-21

## gate-cmd
- confidence: 5 | provenance: bf86ba4 / 2026-10-21
- confidence: 5 | provenance: bf86ba4 / 2026-10-21

## validation-tool
- confidence: 5 | provenance: bf86ba4 / 2026-10-21

## findings
_(none)_

## part-sizing
- confidence: 3 | provenance: 03a4166 / 2026-10-21
- confidence: 3 | provenance: bf86ba4 / 2026-10-21
