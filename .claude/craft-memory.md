---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: arith-expansion-comsub-bypass
      commit: 645f3e1
      date: '2026-10-25'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: arith-expansion-comsub-bypass
      commit: 645f3e1
      date: '2026-10-25'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: arith-expansion-comsub-bypass
      commit: 645f3e1
      date: '2026-10-25'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 5
    provenance:
      run: arith-expansion-comsub-bypass
      commit: 645f3e1
      date: '2026-10-25'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: arith-expansion-comsub-bypass
      commit: 645f3e1
      date: '2026-10-25'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 3
    provenance:
      run: arith-expansion-comsub-bypass
      commit: 645f3e1
      date: '2026-10-25'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 645f3e1 / 2026-10-25

## gate-cmd
- confidence: 5 | provenance: 645f3e1 / 2026-10-25
- confidence: 5 | provenance: 645f3e1 / 2026-10-25

## validation-tool
- confidence: 5 | provenance: 645f3e1 / 2026-10-25

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: 645f3e1 / 2026-10-25
- confidence: 3 | provenance: 645f3e1 / 2026-10-25
