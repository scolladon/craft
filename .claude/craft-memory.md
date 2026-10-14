---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: stryker-9-upgrade
      commit: 143e731
      date: '2026-10-14'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: stryker-9-upgrade
      commit: 143e731
      date: '2026-10-14'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: stryker-9-upgrade
      commit: 143e731
      date: '2026-10-14'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 4ca05ea6fec7b8df
    confidence: 2
    provenance:
      run: stryker-9-upgrade
      commit: 143e731
      date: '2026-10-14'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: entry-guard-symlink-swap-race
      commit: 85650a1
      date: '2026-10-14'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 3
    provenance:
      run: entry-guard-symlink-swap-race
      commit: 85650a1
      date: '2026-10-14'
  - concern: part-sizing
    size: test-only-kill
    outcome: pass
    confidence: 1
    provenance:
      run: stryker-9-upgrade
      commit: 143e731
      date: '2026-10-14'
  - concern: part-sizing
    size: deps-bump
    outcome: pass
    confidence: 1
    provenance:
      run: stryker-9-upgrade
      commit: 143e731
      date: '2026-10-14'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 143e731 / 2026-10-14

## gate-cmd
- confidence: 5 | provenance: 143e731 / 2026-10-14
- confidence: 5 | provenance: 143e731 / 2026-10-14

## validation-tool
- confidence: 2 | provenance: 143e731 / 2026-10-14

## findings
_(none)_

## part-sizing
- confidence: 4 | provenance: 85650a1 / 2026-10-14
- confidence: 3 | provenance: 85650a1 / 2026-10-14
- confidence: 1 | provenance: 143e731 / 2026-10-14
- confidence: 1 | provenance: 143e731 / 2026-10-14
