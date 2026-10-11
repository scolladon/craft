---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: haiku-guard-mismatch-ownership
      commit: aa8c597
      date: '2026-10-11'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 4
    provenance:
      run: arriving-guard-part-bound
      commit: 78c6faa
      date: '2026-10-10'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: haiku-guard-mismatch-ownership
      commit: aa8c597
      date: '2026-10-11'
validation-tool: []
findings:
  - concern: findings
    file: README.md
    severity: low
    pattern: 'the README corpus counts are checked against files on disk, not git: write and commit design/plan/ADR files one at a time, or an untracked file written ahead makes the count drift and ci.sh goes red'
    confidence: 3
    provenance:
      run: arriving-guard-part-bound
      commit: 78c6faa
      date: '2026-10-10'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: arriving-guard-part-bound
      commit: 78c6faa
      date: '2026-10-10'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: aa8c597 / 2026-10-11

## gate-cmd
- confidence: 4 | provenance: 78c6faa / 2026-10-10
- confidence: 5 | provenance: aa8c597 / 2026-10-11

## validation-tool
_(none)_

## findings
- confidence: 3 | provenance: 78c6faa / 2026-10-10

## part-sizing
- confidence: 4 | provenance: 78c6faa / 2026-10-10
