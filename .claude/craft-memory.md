---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 2db140e15f9341eb
    confidence: 4
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
findings:
  - concern: findings
    file: engine/src/guards/shell-tokeniser.js
    severity: high
    pattern: unmodelled-bash-construct-guard-bypass
    confidence: 1
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
  - concern: findings
    file: engine/src/guards/git-plain-command-gate.js
    severity: high
    pattern: allowlist-escape-near-git
    confidence: 1
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
  - concern: findings
    file: engine/src/guards/shell-git-invocations.js
    severity: high
    pattern: quadratic-parse-hook-timeout-fail-open
    confidence: 1
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 5
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 1
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: ebda35f / 2026-10-16

## gate-cmd
- confidence: 5 | provenance: ebda35f / 2026-10-16
- confidence: 5 | provenance: ebda35f / 2026-10-16

## validation-tool
- confidence: 4 | provenance: ebda35f / 2026-10-16

## findings
- confidence: 1 | provenance: ebda35f / 2026-10-16
- confidence: 1 | provenance: ebda35f / 2026-10-16
- confidence: 1 | provenance: ebda35f / 2026-10-16

## part-sizing
- confidence: 5 | provenance: ebda35f / 2026-10-16
- confidence: 5 | provenance: ebda35f / 2026-10-16
- confidence: 1 | provenance: ebda35f / 2026-10-16
