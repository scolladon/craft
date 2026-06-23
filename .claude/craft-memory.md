---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 1
    provenance:
      run: p23-policy-hooks
      commit: 231f2bd
      date: '2026-06-22'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 1
    provenance:
      run: p23-policy-hooks
      commit: 231f2bd
      date: '2026-06-22'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 1
    provenance:
      run: p23-policy-hooks
      commit: 231f2bd
      date: '2026-06-22'
mutation-tool:
  - concern: mutation-tool
    tool: stryker
    configFingerprint: a9b6ac12ad7061bf
    confidence: 1
    provenance:
      run: p23-policy-hooks
      commit: 231f2bd
      date: '2026-06-22'
findings:
  - concern: findings
    file: engine/src/pipeline-resolve-main.js
    severity: medium
    pattern: cli-or-manifest config consumed without in-resolve validation
    confidence: 1
    provenance:
      run: p23-policy-hooks
      commit: 231f2bd
      date: '2026-06-22'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: p23-policy-hooks
      commit: 231f2bd
      date: '2026-06-22'
  - concern: part-sizing
    size: validator
    outcome: pass
    confidence: 1
    provenance:
      run: p23-policy-hooks
      commit: 231f2bd
      date: '2026-06-22'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 1
    provenance:
      run: p23-policy-hooks
      commit: 231f2bd
      date: '2026-06-22'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 1 | provenance: 231f2bd / 2026-06-22

## gate-cmd
- confidence: 1 | provenance: 231f2bd / 2026-06-22
- confidence: 1 | provenance: 231f2bd / 2026-06-22

## mutation-tool
- confidence: 1 | provenance: 231f2bd / 2026-06-22

## findings
- confidence: 1 | provenance: 231f2bd / 2026-06-22

## part-sizing
- confidence: 1 | provenance: 231f2bd / 2026-06-22
- confidence: 1 | provenance: 231f2bd / 2026-06-22
- confidence: 1 | provenance: 231f2bd / 2026-06-22
