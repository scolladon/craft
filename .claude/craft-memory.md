---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: claude-ext-diff-hook-gaps
      commit: 518c119
      date: '2026-10-18'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: claude-ext-diff-hook-gaps
      commit: 518c119
      date: '2026-10-18'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: claude-ext-diff-hook-gaps
      commit: 518c119
      date: '2026-10-18'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 3
    provenance:
      run: claude-ext-diff-hook-gaps
      commit: 518c119
      date: '2026-10-18'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: claude-ext-diff-hook-gaps
      commit: 518c119
      date: '2026-10-18'
  - concern: part-sizing
    size: adapter-wiring
    outcome: pass
    confidence: 1
    provenance:
      run: codex-write-stdin-tty-close
      commit: d593512
      date: '2026-10-18'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: claude-ext-diff-hook-gaps
      commit: 518c119
      date: '2026-10-18'
  - concern: part-sizing
    size: bash-hook-rewrite
    outcome: pass
    confidence: 1
    provenance:
      run: claude-ext-diff-hook-gaps
      commit: 518c119
      date: '2026-10-18'
  - concern: part-sizing
    size: differential-test
    outcome: pass
    confidence: 1
    provenance:
      run: claude-ext-diff-hook-gaps
      commit: 518c119
      date: '2026-10-18'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 518c119 / 2026-10-18

## gate-cmd
- confidence: 5 | provenance: 518c119 / 2026-10-18
- confidence: 5 | provenance: 518c119 / 2026-10-18

## validation-tool
- confidence: 3 | provenance: 518c119 / 2026-10-18

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: 518c119 / 2026-10-18
- confidence: 1 | provenance: d593512 / 2026-10-18
- confidence: 1 | provenance: 518c119 / 2026-10-18
- confidence: 1 | provenance: 518c119 / 2026-10-18
- confidence: 1 | provenance: 518c119 / 2026-10-18
