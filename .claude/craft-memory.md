---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: sibling-spawn-site-defects
      commit: 51cb456
      date: '2026-10-12'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix engine test
    confidence: 5
    provenance:
      run: sibling-spawn-site-defects
      commit: 51cb456
      date: '2026-10-12'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: sibling-spawn-site-defects
      commit: 51cb456
      date: '2026-10-12'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 2
    provenance:
      run: waiver-mention-not-waiver
      commit: 0632f47
      date: '2026-10-12'
findings:
  - concern: findings
    file: test/source-hygiene.test.js
    severity: medium
    pattern: git spawn inherits ambient GIT_DIR; a hook in a linked worktree exports an absolute one
    confidence: 1
    provenance:
      run: sibling-spawn-site-defects
      commit: 51cb456
      date: '2026-10-12'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 3
    provenance:
      run: waiver-mention-not-waiver
      commit: 0632f47
      date: '2026-10-12'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: waiver-mention-not-waiver
      commit: 0632f47
      date: '2026-10-12'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 1
    provenance:
      run: sibling-spawn-site-defects
      commit: 51cb456
      date: '2026-10-12'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 51cb456 / 2026-10-12

## gate-cmd
- confidence: 5 | provenance: 51cb456 / 2026-10-12
- confidence: 5 | provenance: 51cb456 / 2026-10-12

## validation-tool
- confidence: 2 | provenance: 0632f47 / 2026-10-12

## findings
- confidence: 1 | provenance: 51cb456 / 2026-10-12

## part-sizing
- confidence: 3 | provenance: 0632f47 / 2026-10-12
- confidence: 1 | provenance: 0632f47 / 2026-10-12
- confidence: 1 | provenance: 51cb456 / 2026-10-12
