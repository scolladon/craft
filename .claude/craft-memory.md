---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 5
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
findings:
  - concern: findings
    file: hooks/progress/status-line.test.tsx
    severity: medium
    pattern: guard-test-passes-via-earlier-exit
    confidence: 1
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
  - concern: findings
    file: docs/guides/customizing.md
    severity: medium
    pattern: doc-example-unreachable-by-code
    confidence: 1
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
  - concern: findings
    file: hooks/progress/status-line.ts
    severity: low
    pattern: inconsistent-status-literals
    confidence: 1
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
  - concern: findings
    file: test/run-progress-docs.test.js
    severity: low
    pattern: docs-pin-bare-common-word
    confidence: 1
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
  - concern: findings
    file: hooks/progress/status-line.test.tsx
    severity: low
    pattern: sut-names-input-not-unit
    confidence: 1
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 5
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
  - concern: part-sizing
    size: host-module
    outcome: pass
    confidence: 2
    provenance:
      run: progress-status-line-bar
      commit: a4e1402
      date: '2026-10-30'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: a4e1402 / 2026-10-30

## gate-cmd
- confidence: 5 | provenance: a4e1402 / 2026-10-30
- confidence: 5 | provenance: a4e1402 / 2026-10-30

## validation-tool
- confidence: 5 | provenance: a4e1402 / 2026-10-30

## findings
- confidence: 1 | provenance: a4e1402 / 2026-10-30
- confidence: 1 | provenance: a4e1402 / 2026-10-30
- confidence: 1 | provenance: a4e1402 / 2026-10-30
- confidence: 1 | provenance: a4e1402 / 2026-10-30
- confidence: 1 | provenance: a4e1402 / 2026-10-30

## part-sizing
- confidence: 5 | provenance: a4e1402 / 2026-10-30
- confidence: 5 | provenance: a4e1402 / 2026-10-30
- confidence: 2 | provenance: a4e1402 / 2026-10-30
