---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: miner-compaction-uuid-dedup
      commit: 53429a7
      date: '2026-10-11'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix engine test
    confidence: 4
    provenance:
      run: miner-compaction-uuid-dedup
      commit: 53429a7
      date: '2026-10-11'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: miner-compaction-uuid-dedup
      commit: 53429a7
      date: '2026-10-11'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 1
    provenance:
      run: miner-compaction-uuid-dedup
      commit: 53429a7
      date: '2026-10-11'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: hooks-locale-guard-macos-ci
      commit: 477bd62
      date: '2026-10-11'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: miner-compaction-uuid-dedup
      commit: 53429a7
      date: '2026-10-11'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 53429a7 / 2026-10-11

## gate-cmd
- confidence: 4 | provenance: 53429a7 / 2026-10-11
- confidence: 5 | provenance: 53429a7 / 2026-10-11

## validation-tool
- confidence: 1 | provenance: 53429a7 / 2026-10-11

## findings
_(none)_

## part-sizing
- confidence: 4 | provenance: 477bd62 / 2026-10-11
- confidence: 1 | provenance: 53429a7 / 2026-10-11
