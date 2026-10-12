---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: waiver-mention-not-waiver
      commit: 0632f47
      date: '2026-10-12'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix engine test
    confidence: 5
    provenance:
      run: waiver-mention-not-waiver
      commit: 0632f47
      date: '2026-10-12'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: waiver-mention-not-waiver
      commit: 0632f47
      date: '2026-10-12'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 3
    provenance:
      run: waiver-mention-not-waiver
      commit: 0632f47
      date: '2026-10-12'
findings:
  - concern: findings
    file: engine/src/hygiene-lint-core.js
    severity: medium
    pattern: line-based fence recognizer misses CRLF and closer-indentation edge cases
    confidence: 1
    provenance:
      run: waiver-mention-not-waiver
      commit: 0632f47
      date: '2026-10-12'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: waiver-mention-not-waiver
      commit: 0632f47
      date: '2026-10-12'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 2
    provenance:
      run: waiver-mention-not-waiver
      commit: 0632f47
      date: '2026-10-12'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 0632f47 / 2026-10-12

## gate-cmd
- confidence: 5 | provenance: 0632f47 / 2026-10-12
- confidence: 5 | provenance: 0632f47 / 2026-10-12

## validation-tool
- confidence: 3 | provenance: 0632f47 / 2026-10-12

## findings
- confidence: 1 | provenance: 0632f47 / 2026-10-12

## part-sizing
- confidence: 4 | provenance: 0632f47 / 2026-10-12
- confidence: 2 | provenance: 0632f47 / 2026-10-12
