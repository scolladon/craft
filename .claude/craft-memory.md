---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 5
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
findings:
  - concern: findings
    file: scripts/run-ledger.sh
    severity: medium
    pattern: one-line-field-accepts-embedded-newline-or-unicode-control
    confidence: 1
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
  - concern: findings
    file: scripts/run-ledger.sh
    severity: medium
    pattern: retry-loop-treats-every-failure-as-taken
    confidence: 1
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
  - concern: findings
    file: test/run-ledger.test.js
    severity: medium
    pattern: refusal-guard-without-a-killing-test
    confidence: 1
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 5
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
  - concern: part-sizing
    size: bash-script
    outcome: pass
    confidence: 1
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
  - concern: part-sizing
    size: agent-def
    outcome: pass
    confidence: 1
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
  - concern: part-sizing
    size: adapter-config
    outcome: pass
    confidence: 1
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
  - concern: part-sizing
    size: pipeline-spine
    outcome: pass
    confidence: 1
    provenance:
      run: discovered-impacts
      commit: ad472ee
      date: '2026-10-26'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: ad472ee / 2026-10-26

## gate-cmd
- confidence: 5 | provenance: ad472ee / 2026-10-26
- confidence: 5 | provenance: ad472ee / 2026-10-26

## validation-tool
- confidence: 5 | provenance: ad472ee / 2026-10-26

## findings
- confidence: 1 | provenance: ad472ee / 2026-10-26
- confidence: 1 | provenance: ad472ee / 2026-10-26
- confidence: 1 | provenance: ad472ee / 2026-10-26

## part-sizing
- confidence: 5 | provenance: ad472ee / 2026-10-26
- confidence: 5 | provenance: ad472ee / 2026-10-26
- confidence: 1 | provenance: ad472ee / 2026-10-26
- confidence: 1 | provenance: ad472ee / 2026-10-26
- confidence: 1 | provenance: ad472ee / 2026-10-26
- confidence: 1 | provenance: ad472ee / 2026-10-26
