---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: guard-arith-cleanup
      commit: af8a80f
      date: '2026-10-26'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: guard-arith-cleanup
      commit: af8a80f
      date: '2026-10-26'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: guard-arith-cleanup
      commit: af8a80f
      date: '2026-10-26'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 5
    provenance:
      run: guard-arith-cleanup
      commit: af8a80f
      date: '2026-10-26'
findings:
  - concern: findings
    file: engine/src/guards/shell-tokeniser.js
    pattern: word-rule-opener-spelling-leak
    severity: HIGH
    confidence: 1
    provenance:
      run: guard-arith-cleanup
      commit: af8a80f
      date: '2026-10-26'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: guard-arith-cleanup
      commit: af8a80f
      date: '2026-10-26'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 4
    provenance:
      run: guard-arith-cleanup
      commit: af8a80f
      date: '2026-10-26'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 1
    provenance:
      run: guard-arith-cleanup
      commit: af8a80f
      date: '2026-10-26'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: af8a80f / 2026-10-26

## gate-cmd
- confidence: 5 | provenance: af8a80f / 2026-10-26
- confidence: 5 | provenance: af8a80f / 2026-10-26

## validation-tool
- confidence: 5 | provenance: af8a80f / 2026-10-26

## findings
- confidence: 1 | provenance: af8a80f / 2026-10-26

## part-sizing
- confidence: 5 | provenance: af8a80f / 2026-10-26
- confidence: 4 | provenance: af8a80f / 2026-10-26
- confidence: 1 | provenance: af8a80f / 2026-10-26
