---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: codex-0163-rules-reprobe
      commit: 5f137c2
      date: '2026-10-22'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-0163-rules-reprobe
      commit: 5f137c2
      date: '2026-10-22'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-0163-rules-reprobe
      commit: 5f137c2
      date: '2026-10-22'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 1a568887baa7ca30
    confidence: 3
    provenance:
      run: per-line-over-range-line
      commit: bf86ba4
      date: '2026-10-21'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: codex-0163-rules-reprobe
      commit: 5f137c2
      date: '2026-10-22'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: per-line-over-range-line
      commit: bf86ba4
      date: '2026-10-21'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 5f137c2 / 2026-10-22

## gate-cmd
- confidence: 5 | provenance: 5f137c2 / 2026-10-22
- confidence: 5 | provenance: 5f137c2 / 2026-10-22

## validation-tool
- confidence: 3 | provenance: bf86ba4 / 2026-10-21

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: 5f137c2 / 2026-10-22
- confidence: 1 | provenance: bf86ba4 / 2026-10-21
