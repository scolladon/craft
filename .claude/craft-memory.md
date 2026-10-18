---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: planning-no-op-outcome
      commit: 49e22c6
      date: '2026-10-18'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: planning-no-op-outcome
      commit: 49e22c6
      date: '2026-10-18'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: planning-no-op-outcome
      commit: 49e22c6
      date: '2026-10-18'
validation-tool: []
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: planning-no-op-outcome
      commit: 49e22c6
      date: '2026-10-18'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 49e22c6 / 2026-10-18

## gate-cmd
- confidence: 5 | provenance: 49e22c6 / 2026-10-18
- confidence: 5 | provenance: 49e22c6 / 2026-10-18

## validation-tool
_(none)_

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: 49e22c6 / 2026-10-18
