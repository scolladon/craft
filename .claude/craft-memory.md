---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: bin-entry-symlink-guard
      commit: 381ba0d
      date: '2026-10-14'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: bin-entry-symlink-guard
      commit: 381ba0d
      date: '2026-10-14'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: bin-entry-symlink-guard
      commit: 381ba0d
      date: '2026-10-14'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 1
    provenance:
      run: bin-entry-symlink-guard
      commit: 381ba0d
      date: '2026-10-14'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: claude-hook-foreground-stall-probe
      commit: b9bbafc
      date: '2026-10-14'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 2
    provenance:
      run: bin-entry-symlink-guard
      commit: 381ba0d
      date: '2026-10-14'
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: bin-entry-symlink-guard
      commit: 381ba0d
      date: '2026-10-14'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 381ba0d / 2026-10-14

## gate-cmd
- confidence: 5 | provenance: 381ba0d / 2026-10-14
- confidence: 5 | provenance: 381ba0d / 2026-10-14

## validation-tool
- confidence: 1 | provenance: 381ba0d / 2026-10-14

## findings
_(none)_

## part-sizing
- confidence: 4 | provenance: b9bbafc / 2026-10-14
- confidence: 2 | provenance: 381ba0d / 2026-10-14
- confidence: 1 | provenance: 381ba0d / 2026-10-14
