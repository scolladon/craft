---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 5
    provenance:
      run: harder-decisions-fork-fixture
      commit: 10ceac6
      date: '2026-10-09'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: harder-decisions-fork-fixture
      commit: 10ceac6
      date: '2026-10-09'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 5
    provenance:
      run: harder-decisions-fork-fixture
      commit: 10ceac6
      date: '2026-10-09'
validation-tool: []
findings:
  - concern: findings
    file: contracts/construction.md
    severity: medium
    pattern: 'a test-label change in agents/planner.md or templates/plan.md must be checked against contracts/construction.md, which is injected into every part-implementer spawn: a plan label the contract does not know (a passing GUARD vs "it must fail") makes the implementer block, refuse, or break code to satisfy the contract'
    confidence: 2
    provenance:
      run: arriving-guard-contract-rule
      commit: 979862b
      date: '2026-10-09'
  - concern: findings
    file: scripts/ci.sh
    severity: medium
    pattern: the lint block is one `a && b && …` list; under set -e a failure in any command but the last does not stop the script, so a red lint there exits 0 — a green ci.sh does not prove every lint in that list passed
    confidence: 1
    provenance:
      run: harder-decisions-fork-fixture
      commit: 10ceac6
      date: '2026-10-09'
  - concern: findings
    file: README.md
    severity: low
    pattern: 'the README corpus counts are checked against files on disk, not git: write and commit design/plan/ADR files one at a time, or an untracked file written ahead makes the count drift and ci.sh goes red'
    confidence: 1
    provenance:
      run: harder-decisions-fork-fixture
      commit: 10ceac6
      date: '2026-10-09'
part-sizing:
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 5
    provenance:
      run: harder-decisions-fork-fixture
      commit: 10ceac6
      date: '2026-10-09'
---

# craft memory store
> Machine-maintained. Edit the YAML frontmatter above, not this body.

## toolchain
- confidence: 5 | provenance: 10ceac6 / 2026-10-09

## gate-cmd
- confidence: 5 | provenance: 10ceac6 / 2026-10-09
- confidence: 5 | provenance: 10ceac6 / 2026-10-09

## validation-tool
_(none)_

## findings
- confidence: 2 | provenance: 979862b / 2026-10-09
- confidence: 1 | provenance: 10ceac6 / 2026-10-09
- confidence: 1 | provenance: 10ceac6 / 2026-10-09

## part-sizing
- confidence: 5 | provenance: 10ceac6 / 2026-10-09
