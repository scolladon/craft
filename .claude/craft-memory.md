---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: bash53-heredoc-comsub-false-block
      commit: 5902d5a
      date: '2026-10-23'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: bash53-heredoc-comsub-false-block
      commit: 5902d5a
      date: '2026-10-23'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: bash53-heredoc-comsub-false-block
      commit: 5902d5a
      date: '2026-10-23'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 4
    provenance:
      run: bash53-heredoc-comsub-false-block
      commit: 5902d5a
      date: '2026-10-23'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: bash53-heredoc-comsub-false-block
      commit: 5902d5a
      date: '2026-10-23'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 2
    provenance:
      run: bash53-heredoc-comsub-false-block
      commit: 5902d5a
      date: '2026-10-23'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 1
    provenance:
      run: bash53-heredoc-comsub-false-block
      commit: 5902d5a
      date: '2026-10-23'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 5902d5a / 2026-10-23

## gate-cmd
- confidence: 5 | provenance: 5902d5a / 2026-10-23
- confidence: 5 | provenance: 5902d5a / 2026-10-23

## validation-tool
- confidence: 4 | provenance: 5902d5a / 2026-10-23

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: 5902d5a / 2026-10-23
- confidence: 2 | provenance: 5902d5a / 2026-10-23
- confidence: 1 | provenance: 5902d5a / 2026-10-23
