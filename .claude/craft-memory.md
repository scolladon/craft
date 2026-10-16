---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: 86b6f717303422e2
    confidence: 5
    provenance:
      run: fixture-commits-skip-gpg-signing
      commit: '6114371'
      date: '2026-10-16'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: fixture-commits-skip-gpg-signing
      commit: '6114371'
      date: '2026-10-16'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: fixture-commits-skip-gpg-signing
      commit: '6114371'
      date: '2026-10-16'
validation-tool:
  - concern: validation-tool
    id: mutation
    configFingerprint: 2db140e15f9341eb
    confidence: 3
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
findings: []
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 4
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
  - concern: part-sizing
    size: src-suite
    outcome: pass
    confidence: 4
    provenance:
      run: copilot-git-argv-normalising-guard
      commit: ebda35f
      date: '2026-10-16'
  - concern: part-sizing
    size: test-infra
    outcome: pass
    confidence: 2
    provenance:
      run: fixture-commits-skip-gpg-signing
      commit: '6114371'
      date: '2026-10-16'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 6114371 / 2026-10-16

## gate-cmd
- confidence: 5 | provenance: 6114371 / 2026-10-16
- confidence: 5 | provenance: 6114371 / 2026-10-16

## validation-tool
- confidence: 3 | provenance: ebda35f / 2026-10-16

## findings
_(none)_

## part-sizing
- confidence: 4 | provenance: ebda35f / 2026-10-16
- confidence: 4 | provenance: ebda35f / 2026-10-16
- confidence: 2 | provenance: 6114371 / 2026-10-16
