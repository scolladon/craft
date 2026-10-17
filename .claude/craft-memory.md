---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: ledger-stamps-own-timestamps
      commit: 7835feb
      date: '2026-10-17'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: ledger-stamps-own-timestamps
      commit: 7835feb
      date: '2026-10-17'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: ledger-stamps-own-timestamps
      commit: 7835feb
      date: '2026-10-17'
validation-tool: []
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: ledger-stamps-own-timestamps
      commit: 7835feb
      date: '2026-10-17'
  - concern: part-sizing
    size: shell-script
    outcome: pass
    confidence: 1
    provenance:
      run: ledger-stamps-own-timestamps
      commit: 7835feb
      date: '2026-10-17'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 7835feb / 2026-10-17

## gate-cmd
- confidence: 5 | provenance: 7835feb / 2026-10-17
- confidence: 5 | provenance: 7835feb / 2026-10-17

## validation-tool
_(none)_

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: 7835feb / 2026-10-17
- confidence: 1 | provenance: 7835feb / 2026-10-17
