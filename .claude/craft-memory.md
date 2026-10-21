---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 5
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
findings:
  - concern: findings
    file: engine/src/guards/shell-git-invocations.js
    severity: high
    pattern: a literal-token anchor test misses glob, brace, dynamic and path spellings of git or config
    confidence: 2
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
  - concern: findings
    file: engine/src/guards/shell-tokeniser.js
    severity: high
    pattern: a shell reparse of an env -S string misses env re-splitting, comments, escapes and appended operands
    confidence: 1
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: guard-fuzz-scale-ext-diff-widen
      commit: ff70c76
      date: '2026-10-20'
  - concern: part-sizing
    size: differential-test
    outcome: pass
    confidence: 1
    provenance:
      run: guard-fuzz-scale-ext-diff-widen
      commit: ff70c76
      date: '2026-10-20'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 3
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
  - concern: part-sizing
    size: test-repin
    outcome: pass
    confidence: 1
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
  - concern: part-sizing
    size: test-guard
    outcome: pass
    confidence: 1
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 9196650 / 2026-10-21

## gate-cmd
- confidence: 5 | provenance: 9196650 / 2026-10-21
- confidence: 5 | provenance: 9196650 / 2026-10-21

## validation-tool
- confidence: 5 | provenance: 9196650 / 2026-10-21

## findings
- confidence: 2 | provenance: 9196650 / 2026-10-21
- confidence: 1 | provenance: 9196650 / 2026-10-21

## part-sizing
- confidence: 4 | provenance: ff70c76 / 2026-10-20
- confidence: 1 | provenance: ff70c76 / 2026-10-20
- confidence: 3 | provenance: 9196650 / 2026-10-21
- confidence: 1 | provenance: 9196650 / 2026-10-21
- confidence: 1 | provenance: 9196650 / 2026-10-21
