---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: codex-0163-reprobe
      commit: d03cc6c
      date: '2026-10-22'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-0163-reprobe
      commit: d03cc6c
      date: '2026-10-22'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-0163-reprobe
      commit: d03cc6c
      date: '2026-10-22'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 4
    provenance:
      run: per-line-over-range-line
      commit: bf86ba4
      date: '2026-10-21'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: codex-0163-reprobe
      commit: d03cc6c
      date: '2026-10-22'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 2
    provenance:
      run: per-line-over-range-line
      commit: bf86ba4
      date: '2026-10-21'
  - concern: part-sizing
    size: comment-pins
    outcome: pass
    confidence: 1
    provenance:
      run: codex-0163-reprobe
      commit: d03cc6c
      date: '2026-10-22'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: d03cc6c / 2026-10-22

## gate-cmd
- confidence: 5 | provenance: d03cc6c / 2026-10-22
- confidence: 5 | provenance: d03cc6c / 2026-10-22

## validation-tool
- confidence: 4 | provenance: bf86ba4 / 2026-10-21

## findings
_(none)_

## part-sizing
- confidence: 4 | provenance: d03cc6c / 2026-10-22
- confidence: 2 | provenance: bf86ba4 / 2026-10-21
- confidence: 1 | provenance: d03cc6c / 2026-10-22
