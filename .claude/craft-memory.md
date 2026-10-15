---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: codex-0162-reprobe
      commit: fd8f1dc
      date: '2026-10-15'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-0162-reprobe
      commit: fd8f1dc
      date: '2026-10-15'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-0162-reprobe
      commit: fd8f1dc
      date: '2026-10-15'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 3
    provenance:
      run: codex-0162-reprobe
      commit: fd8f1dc
      date: '2026-10-15'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: codex-0162-reprobe
      commit: fd8f1dc
      date: '2026-10-15'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 4
    provenance:
      run: codex-0162-reprobe
      commit: fd8f1dc
      date: '2026-10-15'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: fd8f1dc / 2026-10-15

## gate-cmd
- confidence: 5 | provenance: fd8f1dc / 2026-10-15
- confidence: 5 | provenance: fd8f1dc / 2026-10-15

## validation-tool
- confidence: 3 | provenance: fd8f1dc / 2026-10-15

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: fd8f1dc / 2026-10-15
- confidence: 4 | provenance: fd8f1dc / 2026-10-15
