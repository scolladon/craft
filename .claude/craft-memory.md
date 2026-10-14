---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: claude-hook-foreground-stall-probe
      commit: b9bbafc
      date: '2026-10-14'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: claude-hook-foreground-stall-probe
      commit: b9bbafc
      date: '2026-10-14'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: claude-hook-foreground-stall-probe
      commit: b9bbafc
      date: '2026-10-14'
validation-tool: []
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: claude-hook-foreground-stall-probe
      commit: b9bbafc
      date: '2026-10-14'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 1
    provenance:
      run: claude-hook-nonzero-exit-probe
      commit: 0ded716
      date: '2026-10-13'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: b9bbafc / 2026-10-14

## gate-cmd
- confidence: 5 | provenance: b9bbafc / 2026-10-14
- confidence: 5 | provenance: b9bbafc / 2026-10-14

## validation-tool
_(none)_

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: b9bbafc / 2026-10-14
- confidence: 1 | provenance: 0ded716 / 2026-10-13
