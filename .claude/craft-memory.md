---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: hooks-locale-guard-macos-ci
      commit: 477bd62
      date: '2026-10-11'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix engine test
    confidence: 3
    provenance:
      run: pin-claim-status-set-to-contract
      commit: 9865c51
      date: '2026-10-11'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: hooks-locale-guard-macos-ci
      commit: 477bd62
      date: '2026-10-11'
validation-tool: []
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: hooks-locale-guard-macos-ci
      commit: 477bd62
      date: '2026-10-11'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 477bd62 / 2026-10-11

## gate-cmd
- confidence: 3 | provenance: 9865c51 / 2026-10-11
- confidence: 5 | provenance: 477bd62 / 2026-10-11

## validation-tool
_(none)_

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: 477bd62 / 2026-10-11
