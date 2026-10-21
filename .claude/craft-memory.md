---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: copilot-write-bash-pty-probe
      commit: 313f088
      date: '2026-10-21'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: copilot-write-bash-pty-probe
      commit: 313f088
      date: '2026-10-21'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: copilot-write-bash-pty-probe
      commit: 313f088
      date: '2026-10-21'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 4
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
findings:
  - concern: findings
    file: engine/src/guards/shell-git-invocations.js
    severity: high
    pattern: a literal-token anchor test misses glob, brace, dynamic and path spellings of git or config
    confidence: 1
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: copilot-write-bash-pty-probe
      commit: 313f088
      date: '2026-10-21'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 2
    provenance:
      run: git-show-ext-diff-default-deny
      commit: '9196650'
      date: '2026-10-21'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 313f088 / 2026-10-21

## gate-cmd
- confidence: 5 | provenance: 313f088 / 2026-10-21
- confidence: 5 | provenance: 313f088 / 2026-10-21

## validation-tool
- confidence: 4 | provenance: 9196650 / 2026-10-21

## findings
- confidence: 1 | provenance: 9196650 / 2026-10-21

## part-sizing
- confidence: 5 | provenance: 313f088 / 2026-10-21
- confidence: 2 | provenance: 9196650 / 2026-10-21
