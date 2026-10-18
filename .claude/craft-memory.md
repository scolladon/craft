---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: codex-marketplace-entry-adr-252
      commit: eab55ee
      date: '2026-10-18'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-marketplace-entry-adr-252
      commit: eab55ee
      date: '2026-10-18'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: codex-marketplace-entry-adr-252
      commit: eab55ee
      date: '2026-10-18'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 2db140e15f9341eb
    confidence: 1
    provenance:
      run: driver-rebuild-bg-lock-gaps
      commit: 40ba833
      date: '2026-10-18'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: codex-marketplace-entry-adr-252
      commit: eab55ee
      date: '2026-10-18'
  - concern: part-sizing
    size: test-and-config
    outcome: pass
    confidence: 1
    provenance:
      run: codex-marketplace-entry-adr-252
      commit: eab55ee
      date: '2026-10-18'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: eab55ee / 2026-10-18

## gate-cmd
- confidence: 5 | provenance: eab55ee / 2026-10-18
- confidence: 5 | provenance: eab55ee / 2026-10-18

## validation-tool
- confidence: 1 | provenance: 40ba833 / 2026-10-18

## findings
_(none)_

## part-sizing
- confidence: 5 | provenance: eab55ee / 2026-10-18
- confidence: 1 | provenance: eab55ee / 2026-10-18
