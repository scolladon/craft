---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: doctrine-register
      commit: 6aab796
      date: '2026-11-20'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: doctrine-register
      commit: 6aab796
      date: '2026-11-20'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: doctrine-register
      commit: 6aab796
      date: '2026-11-20'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 5
    provenance:
      run: doctrine-register
      commit: 6aab796
      date: '2026-11-20'
findings:
  - concern: findings
    file: engine/src/rulings.js
    pattern: register grammar accepted malformed segments
    severity: medium
    confidence: 1
    provenance:
      run: doctrine-register
      commit: 6aab796
      date: '2026-11-20'
  - concern: findings
    file: engine/bin/rulings-hint.js
    pattern: process.exit after stdout write truncates piped output
    severity: medium
    confidence: 1
    provenance:
      run: doctrine-register
      commit: 6aab796
      date: '2026-11-20'
  - concern: findings
    file: engine/src/rulings-migrate-main.js
    pattern: migration parser missed corpus marker variants
    severity: medium
    confidence: 1
    provenance:
      run: doctrine-register
      commit: 6aab796
      date: '2026-11-20'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 4
    provenance:
      run: decisions-doctrine-layer
      commit: 33981d0
      date: '2026-11-05'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 6aab796 / 2026-11-20

## gate-cmd
- confidence: 5 | provenance: 6aab796 / 2026-11-20
- confidence: 5 | provenance: 6aab796 / 2026-11-20

## validation-tool
- confidence: 5 | provenance: 6aab796 / 2026-11-20

## findings
- confidence: 1 | provenance: 6aab796 / 2026-11-20
- confidence: 1 | provenance: 6aab796 / 2026-11-20
- confidence: 1 | provenance: 6aab796 / 2026-11-20

## part-sizing
- confidence: 4 | provenance: 33981d0 / 2026-11-05
- confidence: 4 | provenance: 33981d0 / 2026-11-05
