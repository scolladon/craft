---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: compaction-estimate-at-done
      commit: c9a2e79
      date: '2026-10-11'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix engine test
    confidence: 5
    provenance:
      run: compaction-estimate-at-done
      commit: c9a2e79
      date: '2026-10-11'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: compaction-estimate-at-done
      commit: c9a2e79
      date: '2026-10-11'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 2
    provenance:
      run: compaction-estimate-at-done
      commit: c9a2e79
      date: '2026-10-11'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: compaction-estimate-at-done
      commit: c9a2e79
      date: '2026-10-11'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 2
    provenance:
      run: compaction-estimate-at-done
      commit: c9a2e79
      date: '2026-10-11'
  - concern: part-sizing
    size: composition-root
    outcome: pass
    confidence: 1
    provenance:
      run: compaction-estimate-at-done
      commit: c9a2e79
      date: '2026-10-11'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: c9a2e79 / 2026-10-11

## gate-cmd
- confidence: 5 | provenance: c9a2e79 / 2026-10-11
- confidence: 5 | provenance: c9a2e79 / 2026-10-11

## validation-tool
- confidence: 2 | provenance: c9a2e79 / 2026-10-11

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: c9a2e79 / 2026-10-11
- confidence: 2 | provenance: c9a2e79 / 2026-10-11
- confidence: 1 | provenance: c9a2e79 / 2026-10-11
