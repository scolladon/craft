---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: copilot-guard-differential-fuzz-arm
      commit: 3ec2388
      date: '2026-10-19'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: copilot-guard-differential-fuzz-arm
      commit: 3ec2388
      date: '2026-10-19'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: copilot-guard-differential-fuzz-arm
      commit: 3ec2388
      date: '2026-10-19'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 4
    provenance:
      run: copilot-guard-differential-fuzz-arm
      commit: 3ec2388
      date: '2026-10-19'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: copilot-guard-differential-fuzz-arm
      commit: 3ec2388
      date: '2026-10-19'
  - concern: part-sizing
    size: differential-test
    outcome: pass
    confidence: 2
    provenance:
      run: copilot-guard-differential-fuzz-arm
      commit: 3ec2388
      date: '2026-10-19'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 3ec2388 / 2026-10-19

## gate-cmd
- confidence: 5 | provenance: 3ec2388 / 2026-10-19
- confidence: 5 | provenance: 3ec2388 / 2026-10-19

## validation-tool
- confidence: 4 | provenance: 3ec2388 / 2026-10-19

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: 3ec2388 / 2026-10-19
- confidence: 2 | provenance: 3ec2388 / 2026-10-19
