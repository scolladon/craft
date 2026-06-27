---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
validation-tool:
  - concern: validation-tool
    id: stryker
    configFingerprint: a9b6ac12ad7061bf
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
findings:
  - concern: findings
    file: skills/init/SKILL.md
    severity: medium
    pattern: LLM-prose bash temp-file handling needs trailing-X mktemp and reuse of the validated path, not raw-name re-splice
    confidence: 0.5
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
  - concern: findings
    file: skills/run/SKILL.md
    severity: medium
    pattern: a sub-agent renumbering an ordered list updates the headers it touches but leaves cross-references (step-N mentions) stale; sweep all step-N references after any insert or renumber
    confidence: 0.5
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
  - concern: findings
    file: skills/validation/SKILL.md
    severity: medium
    pattern: a per-hunk mutation triager can wrongly declare a survivor "already covered" by an existing assertion; re-run the scoped mutation after triage to confirm the kills landed. A weak includes(", ") passes on an incidental message comma — assert a real adjacent list-pair to actually pin a separator
    confidence: 0.5
    provenance:
      run: simpler-phase-authoring
      commit: d732a5a
      date: '2026-06-27'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: p27-despecialize-craft-sources
      commit: a4849a1
      date: '2026-06-26'
  - concern: part-sizing
    size: validator
    outcome: pass
    confidence: 1
    provenance:
      run: p27-despecialize-craft-sources
      commit: a4849a1
      date: '2026-06-26'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 1
    provenance:
      run: p27-despecialize-craft-sources
      commit: a4849a1
      date: '2026-06-26'
  - concern: part-sizing
    size: resolver-wiring
    outcome: pass
    confidence: 1
    provenance:
      run: p27-despecialize-craft-sources
      commit: a4849a1
      date: '2026-06-26'
  - concern: part-sizing
    size: bash-helper
    outcome: pass
    confidence: 1
    provenance:
      run: p27-despecialize-craft-sources
      commit: a4849a1
      date: '2026-06-26'
  - concern: part-sizing
    size: test-helper
    outcome: pass
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
  - concern: part-sizing
    size: test-edit
    outcome: pass
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
  - concern: part-sizing
    size: bats-guard
    outcome: pass
    confidence: 1
    provenance:
      run: p28-hermetic-test-suites
      commit: 3078c6e
      date: '2026-06-26'
---

# craft memory store
> Machine-maintained advisory cache (ADR-116/120). Edit the YAML frontmatter above, not this body.

## toolchain
- npm (nested: engine) — confidence 1 | 3078c6e / 2026-06-26

## gate-cmd
- part: `node --test 'test/**/*.test.js'` — confidence 1 | 3078c6e / 2026-06-26
- phase: `bash scripts/ci.sh` — confidence 1 | 3078c6e / 2026-06-26

## validation-tool
- stryker (config fingerprint a9b6ac12ad7061bf) — confidence 1 | 3078c6e / 2026-06-26 (probe-confirmed; not run in P28 — test-only change, mutation scope empty)

## findings
- skills/init/SKILL.md — confidence 0.5 | f4785cd (not re-observed since P25 — decayed)
- skills/run/SKILL.md — confidence 0.5 | c8b7685 (prose-edited in P27 but renumber-staleness not re-observed — decayed)

## part-sizing
- pure-module: pass — confidence 1 | a4849a1
- validator: pass — confidence 1 | a4849a1
- docs-prose: pass — confidence 1 | a4849a1
- resolver-wiring: pass — confidence 1 | a4849a1
- bash-helper: pass — confidence 1 | a4849a1 (re-observed in P27 — lock rename + grep-gate bats)
- test-helper: pass — confidence 1 | 3078c6e (P28 — with-cwd.js / empty-home.js isolators + unit tests)
- test-edit: pass — confidence 1 | 3078c6e (P28 — A2/A3/A4 hermeticity wraps, count-neutral)
- bats-guard: pass — confidence 1 | 3078c6e (P28 — hermetic-suite.bats + ci.sh repo-root step)
