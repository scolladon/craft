---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 5
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
findings:
  - concern: findings
    file: engine/test/doctrine-lint-main.test.js
    severity: medium
    pattern: fixture-cites-superseded-adr
    confidence: 1
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
  - concern: findings
    file: engine/src/doctrine.js
    severity: medium
    pattern: counter-case-reason-unchecked
    confidence: 1
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
  - concern: findings
    file: skills/decisions/SKILL.md
    severity: medium
    pattern: supersession-repoint-misses-counter-cases
    confidence: 1
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
  - concern: findings
    file: test/decisions-doctrine-prose.test.js
    severity: medium
    pattern: prose-pin-misses-meaning-clause
    confidence: 1
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
  - concern: findings
    file: engine/src/doctrine-lint-main.js
    severity: medium
    pattern: real-adapter-unexercised
    confidence: 1
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 5
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
  - concern: part-sizing
    size: host-module
    outcome: pass
    confidence: 1
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 33981d0 / 2026-11-05

## gate-cmd
- confidence: 5 | provenance: 33981d0 / 2026-11-05
- confidence: 5 | provenance: 33981d0 / 2026-11-05

## validation-tool
- confidence: 5 | provenance: 33981d0 / 2026-11-05

## findings
- confidence: 1 | provenance: 33981d0 / 2026-11-05
- confidence: 1 | provenance: 33981d0 / 2026-11-05
- confidence: 1 | provenance: 33981d0 / 2026-11-05
- confidence: 1 | provenance: 33981d0 / 2026-11-05
- confidence: 1 | provenance: 33981d0 / 2026-11-05

## part-sizing
- confidence: 5 | provenance: 33981d0 / 2026-11-05
- confidence: 5 | provenance: 33981d0 / 2026-11-05
- confidence: 1 | provenance: a4e1402 / 2026-10-30
