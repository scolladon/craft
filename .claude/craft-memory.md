---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: provenance-sweep-part-two
      commit: e7d8d3a
      date: '2026-10-12'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix engine test
    confidence: 5
    provenance:
      run: provenance-sweep-part-two
      commit: e7d8d3a
      date: '2026-10-12'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: provenance-sweep-part-two
      commit: e7d8d3a
      date: '2026-10-12'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 2
    provenance:
      run: backlog-sweep-six-entries
      commit: fba76f9
      date: '2026-10-12'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: provenance-sweep-part-two
      commit: e7d8d3a
      date: '2026-10-12'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: backlog-sweep-six-entries
      commit: fba76f9
      date: '2026-10-12'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 3
    provenance:
      run: provenance-sweep-part-two
      commit: e7d8d3a
      date: '2026-10-12'
  - concern: part-sizing
    size: test-comments
    outcome: pass
    confidence: 1
    provenance:
      run: provenance-sweep-part-two
      commit: e7d8d3a
      date: '2026-10-12'
  - concern: part-sizing
    size: test-rename
    outcome: pass
    confidence: 1
    provenance:
      run: provenance-sweep-part-two
      commit: e7d8d3a
      date: '2026-10-12'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: e7d8d3a / 2026-10-12

## gate-cmd
- confidence: 5 | provenance: e7d8d3a / 2026-10-12
- confidence: 5 | provenance: e7d8d3a / 2026-10-12

## validation-tool
- confidence: 2 | provenance: fba76f9 / 2026-10-12

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: e7d8d3a / 2026-10-12
- confidence: 1 | provenance: fba76f9 / 2026-10-12
- confidence: 3 | provenance: e7d8d3a / 2026-10-12
- confidence: 1 | provenance: e7d8d3a / 2026-10-12
- confidence: 1 | provenance: e7d8d3a / 2026-10-12
