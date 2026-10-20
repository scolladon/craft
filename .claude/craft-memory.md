---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: lessons-corpus
      commit: c92c81d
      date: '2026-10-20'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: lessons-corpus
      commit: c92c81d
      date: '2026-10-20'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: lessons-corpus
      commit: c92c81d
      date: '2026-10-20'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 5
    provenance:
      run: lessons-corpus
      commit: c92c81d
      date: '2026-10-20'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: lessons-corpus
      commit: c92c81d
      date: '2026-10-20'
  - concern: part-sizing
    size: differential-test
    outcome: pass
    confidence: 1
    provenance:
      run: copilot-guard-differential-fuzz-arm
      commit: 3ec2388
      date: '2026-10-19'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: lessons-corpus
      commit: c92c81d
      date: '2026-10-20'
  - concern: part-sizing
    size: cli-bin
    outcome: pass
    confidence: 1
    provenance:
      run: lessons-corpus
      commit: c92c81d
      date: '2026-10-20'
  - concern: part-sizing
    size: adapter-step
    outcome: pass
    confidence: 1
    provenance:
      run: lessons-corpus
      commit: c92c81d
      date: '2026-10-20'
  - concern: part-sizing
    size: phase-spine
    outcome: pass
    confidence: 1
    provenance:
      run: lessons-corpus
      commit: c92c81d
      date: '2026-10-20'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: c92c81d / 2026-10-20

## gate-cmd
- confidence: 5 | provenance: c92c81d / 2026-10-20
- confidence: 5 | provenance: c92c81d / 2026-10-20

## validation-tool
- confidence: 5 | provenance: c92c81d / 2026-10-20

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: c92c81d / 2026-10-20
- confidence: 1 | provenance: 3ec2388 / 2026-10-19
- confidence: 1 | provenance: c92c81d / 2026-10-20
- confidence: 1 | provenance: c92c81d / 2026-10-20
- confidence: 1 | provenance: c92c81d / 2026-10-20
- confidence: 1 | provenance: c92c81d / 2026-10-20
