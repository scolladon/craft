---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: run-visibility-task-list
      commit: 32fe232
      date: '2026-10-27'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: run-visibility-task-list
      commit: 32fe232
      date: '2026-10-27'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: run-visibility-task-list
      commit: 32fe232
      date: '2026-10-27'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 5
    provenance:
      run: run-visibility-task-list
      commit: 32fe232
      date: '2026-10-27'
findings:
  - concern: findings
    file: hooks/progress/bind.ts
    severity: low
    pattern: state-write-on-unchanged-patch
    confidence: 1
    provenance:
      run: run-visibility-task-list
      commit: 32fe232
      date: '2026-10-27'
  - concern: findings
    file: hooks/progress/attention.test.tsx
    severity: low
    pattern: guard-test-passes-via-earlier-exit
    confidence: 1
    provenance:
      run: run-visibility-task-list
      commit: 32fe232
      date: '2026-10-27'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 5
    provenance:
      run: run-visibility-task-list
      commit: 32fe232
      date: '2026-10-27'
  - concern: part-sizing
    size: host-module
    outcome: pass
    confidence: 1
    provenance:
      run: run-visibility-task-list
      commit: 32fe232
      date: '2026-10-27'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 32fe232 / 2026-10-27

## gate-cmd
- confidence: 5 | provenance: 32fe232 / 2026-10-27
- confidence: 5 | provenance: 32fe232 / 2026-10-27

## validation-tool
- confidence: 5 | provenance: 32fe232 / 2026-10-27

## findings
- confidence: 1 | provenance: 32fe232 / 2026-10-27
- confidence: 1 | provenance: 32fe232 / 2026-10-27

## part-sizing
- confidence: 4 | provenance: ad472ee / 2026-10-26
- confidence: 5 | provenance: 32fe232 / 2026-10-27
- confidence: 1 | provenance: 32fe232 / 2026-10-27
