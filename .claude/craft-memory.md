---
toolchain:
  - concern: toolchain
    ecosystem: npm
    lockfileFingerprint: f6b84e322952d17b
    confidence: 1
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
gate-cmd:
  - concern: gate-cmd
    phase: part
    command: node --test 'test/**/*.test.js'
    confidence: 1
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
  - concern: gate-cmd
    phase: phase
    command: bash scripts/ci.sh
    confidence: 1
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
validation-tool:
  - concern: validation-tool
    id: stryker
    configFingerprint: a9b6ac12ad7061bf
    confidence: 1
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
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
    confidence: 1
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
part-sizing:
  - concern: part-sizing
    size: pure-module
    outcome: pass
    confidence: 1
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
  - concern: part-sizing
    size: validator
    outcome: pass
    confidence: 1
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
  - concern: part-sizing
    size: docs-prose
    outcome: pass
    confidence: 1
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
  - concern: part-sizing
    size: resolver-wiring
    outcome: pass
    confidence: 1
    provenance:
      run: p26-auto-skip-unnecessary-phases
      commit: c8b7685
      date: '2026-06-23'
  - concern: part-sizing
    size: bash-helper
    outcome: pass
    confidence: 0.5
    provenance:
      run: p25-interactive-manifest-generator
      commit: f4785cd
      date: '2026-06-23'
---

# craft memory store
> Machine-maintained advisory cache (ADR-116/120). Edit the YAML frontmatter above, not this body.

## toolchain
- npm (nested: engine) — confidence 1 | c8b7685 / 2026-06-23

## gate-cmd
- part: `node --test 'test/**/*.test.js'` — confidence 1 | c8b7685 / 2026-06-23
- phase: `bash scripts/ci.sh` — confidence 1 | c8b7685 / 2026-06-23

## validation-tool
- stryker (config fingerprint a9b6ac12ad7061bf) — confidence 1 | c8b7685 / 2026-06-23

## findings
- skills/init/SKILL.md — confidence 0.5 | f4785cd (not re-observed in P26 — decayed)
- skills/run/SKILL.md — confidence 1 | c8b7685 / 2026-06-23

## part-sizing
- pure-module: pass — confidence 1 | c8b7685
- validator: pass — confidence 1 | c8b7685
- docs-prose: pass — confidence 1 | c8b7685
- resolver-wiring: pass — confidence 1 | c8b7685
- bash-helper: pass — confidence 0.5 | f4785cd (not re-observed in P26 — decayed)
