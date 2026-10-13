---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: claude-hook-nonzero-exit-probe
      commit: 0ded716
      date: '2026-10-13'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test test/hooks.test.js
    confidence: 5
    provenance:
      run: claude-hook-nonzero-exit-probe
      commit: 0ded716
      date: '2026-10-13'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: claude-hook-nonzero-exit-probe
      commit: 0ded716
      date: '2026-10-13'
validation-tool: []
findings:
  - concern: findings
    file: hooks/git-no-ext-diff.sh
    pattern: failed-feed-read-as-clean-verdict
    severity: medium
    confidence: 1
    provenance:
      run: claude-hook-nonzero-exit-probe
      commit: 0ded716
      date: '2026-10-13'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: claude-hook-nonzero-exit-probe
      commit: 0ded716
      date: '2026-10-13'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 3
    provenance:
      run: codex-trust-matcher-differential-fuzz
      commit: da9171a
      date: '2026-10-13'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 4
    provenance:
      run: claude-hook-nonzero-exit-probe
      commit: 0ded716
      date: '2026-10-13'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 0ded716 / 2026-10-13

## gate-cmd
- confidence: 5 | provenance: 0ded716 / 2026-10-13
- confidence: 5 | provenance: 0ded716 / 2026-10-13

## validation-tool
_(none)_

## findings
- confidence: 1 | provenance: 0ded716 / 2026-10-13

## part-sizing
- confidence: 4 | provenance: 0ded716 / 2026-10-13
- confidence: 3 | provenance: da9171a / 2026-10-13
- confidence: 4 | provenance: 0ded716 / 2026-10-13
