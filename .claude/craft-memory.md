---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: haiku-arriving-guard-handback
      commit: d6d2ec0
      date: '2026-10-10'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: haiku-arriving-guard-handback
      commit: d6d2ec0
      date: '2026-10-10'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: haiku-arriving-guard-handback
      commit: d6d2ec0
      date: '2026-10-10'
validation-tool: []
findings:
  - concern: findings
    file: README.md
    severity: low
    pattern: 'the README corpus counts are checked against files on disk, not git: write and commit design/plan/ADR files one at a time, or an untracked file written ahead makes the count drift and ci.sh goes red'
    confidence: 3
    provenance:
      run: haiku-arriving-guard-handback
      commit: d6d2ec0
      date: '2026-10-10'
  - concern: findings
    file: .github/workflows/ci.yml
    severity: medium
    pattern: 'CI installs shellcheck 0.9.0 from apt while the local one is 0.11.0, which misses SC2015 hits that 0.9.0 flags: a green local ci.sh does not prove CI''s shellcheck passes; reproduce CI with `uvx --from shellcheck-py==0.10.0.1 shellcheck scripts/*.sh hooks/*.sh` (0.9.0 wheels are x86-only)'
    confidence: 2
    provenance:
      run: haiku-arriving-guard-handback
      commit: d6d2ec0
      date: '2026-10-10'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: haiku-arriving-guard-handback
      commit: d6d2ec0
      date: '2026-10-10'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: d6d2ec0 / 2026-10-10

## gate-cmd
- confidence: 5 | provenance: d6d2ec0 / 2026-10-10
- confidence: 5 | provenance: d6d2ec0 / 2026-10-10

## validation-tool
_(none)_

## findings
- confidence: 3 | provenance: d6d2ec0 / 2026-10-10
- confidence: 2 | provenance: d6d2ec0 / 2026-10-10

## part-sizing
- confidence: 5 | provenance: d6d2ec0 / 2026-10-10
