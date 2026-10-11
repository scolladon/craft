---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: pin-claim-status-set-to-contract
      commit: 9865c51
      date: '2026-10-11'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: npm --prefix engine test
    confidence: 5
    provenance:
      run: pin-claim-status-set-to-contract
      commit: 9865c51
      date: '2026-10-11'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: pin-claim-status-set-to-contract
      commit: 9865c51
      date: '2026-10-11'
validation-tool: []
findings:
  - concern: findings
    file: README.md
    severity: low
    pattern: 'the README corpus counts are checked against files on disk, not git: write and commit design/plan/ADR files one at a time, or an untracked file written ahead makes the count drift and ci.sh goes red'
    confidence: 2
    provenance:
      run: arriving-guard-part-bound
      commit: 78c6faa
      date: '2026-10-10'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 3
    provenance:
      run: arriving-guard-part-bound
      commit: 78c6faa
      date: '2026-10-10'
  - concern: part-sizing
    size: test-only-guard
    outcome: pass
    confidence: 1
    provenance:
      run: pin-claim-status-set-to-contract
      commit: 9865c51
      date: '2026-10-11'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 9865c51 / 2026-10-11

## gate-cmd
- confidence: 5 | provenance: 9865c51 / 2026-10-11
- confidence: 5 | provenance: 9865c51 / 2026-10-11

## validation-tool
_(none)_

## findings
- confidence: 2 | provenance: 78c6faa / 2026-10-10

## part-sizing
- confidence: 3 | provenance: 78c6faa / 2026-10-10
- confidence: 1 | provenance: 9865c51 / 2026-10-11
