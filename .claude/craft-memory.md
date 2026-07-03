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
    confidence: 0.65
    provenance:
      run: nested-insert-fail-loud
      commit: 7b3f4bf
      date: '2026-06-28'
  - concern: findings
    file: engine/src/manifest.js
    severity: low
    pattern: in mutation triage, a typeof object-guard on a label/formatting helper that reads only optional props (id/after/before) is an EQUIVALENT mutant — a primitive entry enters the block, reads undefined, and falls through to the same index return; prove benign rather than chasing it. Conversely a primary-field branch can be unobservable through the public API unless an entry carries the field AND an error-triggering condition simultaneously (e.g. a nested insert that also has a top-level id) — that pairing is the kill
    confidence: 0.5
    provenance:
      run: nested-insert-fail-loud
      commit: 7b3f4bf
      date: '2026-06-28'
  - concern: findings
    file: engine/src/manifest-lint-main.js
    severity: medium
    pattern: a lint-time reader of a manifest-supplied file-ref (paths.dod/scripts/backlog.ref) that falls back to reading the bare path is an arbitrary-local-file-read + existence-oracle when linting an untrusted clone; route every manifest file-ref through the same realpath containment the memory/policy helpers use (containByRealpath against the repo root), fail-closed
    confidence: 0.7
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: findings
    file: engine/src/contain.js
    severity: low
    pattern: defense-in-depth lexical+realpath containment layers produce EQUIVALENT mutants (each layer alone catches the other's escapes); non-ENOENT realpath-error rethrow and the filesystem-root-termination branch are unreachable/equivalent — document `// equivalent mutant` (source-hygiene-allowlisted) rather than chase an unkillable test. realpath returns the LEXICAL path so callers retain a TOCTOU/hardlink window — document the limitation, do not claim atomic-open containment
    confidence: 0.6
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: findings
    file: engine/src/dod.js
    severity: low
    pattern: a structured-doc parser that opens a frontmatter block but mis-types the YAML should FAIL LOUD; only a genuinely absent frontmatter block returns null — and "present" means LINE 1 only (mid-file --- are markdown horizontal rules, the docs/DOD.md case). DoD auto criteria may only assert gates recorded BEFORE dod-assert runs (implementation/review) — the validation gate cannot evidence itself
    confidence: 0.75
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: findings
    file: engine/src/observability/usage-aggregate.js
    severity: high
    pattern: a cross-report comparison keyed on per-session run ids can never match a committed baseline — the feature ships dead with green tests; compare per-phase MEANS (corpus-size-invariant, sums turn drift into a corpus-size counter) and keep the math NaN-safe (a malformed group contributes 0, never NaN — NaN silently swallows the flag while null renders visibly as "new")
    confidence: 0.75
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: findings
    file: test/source-hygiene.test.js
    severity: medium
    pattern: a filename/location rule whose real tree contains zero matching files passes vacuously — pin the known artifacts' locations positively (tracked-path assertions) beside the synthetic offender, or moving a binding back into the neutral core is never caught
    confidence: 0.7
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
  - concern: findings
    file: engine/src/intention.js
    severity: high
    pattern: a review-fix that reroutes a value through a NEW helper can silently drop an invariant the replaced path guaranteed (never-throws broke when the coverage check moved from the try/catch matcher to an unguarded one) — re-verify the invariant on the fix delta, not just the finding; an adversarial convergence reviewer scoped to the fix-delta catches it
    confidence: 0.7
    provenance:
      run: intention-port
      commit: 35cd184
      date: '2026-07-03'
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
  - concern: part-sizing
    size: security-module
    outcome: pass
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: part-sizing
    size: schema-module
    outcome: pass
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: part-sizing
    size: structure-lint
    outcome: pass
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: part-sizing
    size: examples-adapter
    outcome: pass
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: part-sizing
    size: bats-port
    outcome: pass
    confidence: 1
    provenance:
      run: clear-backlog-candidates-gated
      commit: f17d07e
      date: '2026-06-28'
  - concern: part-sizing
    size: relocation
    outcome: pass
    confidence: 1
    provenance:
      run: shrink-core-prune-guardrails
      commit: daf7f05
      date: '2026-07-03'
---

# craft memory store
> Machine-maintained advisory cache (ADR-116/120). Edit the YAML frontmatter above, not this body.

## toolchain
- npm (nested: engine) — confidence 1 | 3078c6e / 2026-06-26

## gate-cmd
- part: `node --test 'test/**/*.test.js'` — confidence 1 | 3078c6e / 2026-06-26
- phase: `bash scripts/ci.sh` — confidence 1 | 3078c6e / 2026-06-26

## validation-tool
- stryker (config fingerprint a9b6ac12ad7061bf) — confidence 1 | f17d07e / 2026-06-28 (RUN this batch — 13 survivors killed across contain/dod/manifest-lint-main; new null-id guard + memory dedupe had zero survivors)

## findings
- skills/init/SKILL.md — confidence 0.5 | f4785cd (not re-observed since P25 — decayed)
- skills/run/SKILL.md — confidence 0.5 | c8b7685 (prose-edited in P27 but renumber-staleness not re-observed — decayed)
- engine/src/manifest-lint-main.js — confidence 0.7 | f17d07e (manifest file-refs must be realpath-contained; bare-path fallback = arbitrary-read oracle when linting untrusted clones)
- engine/src/contain.js — confidence 0.6 | f17d07e (defense-in-depth layers ⇒ equivalent mutants; returns lexical path ⇒ TOCTOU/hardlink window — document, don't over-claim)
- engine/src/dod.js — confidence 0.75 | daf7f05 (frontmatter opens at LINE 1 only — mid-file `---` are hr rules, the docs/DOD.md case; DoD auto criteria may only assert gates recorded before dod-assert runs — the validation gate cannot evidence itself)
- engine/src/observability/usage-aggregate.js — confidence 0.75 | daf7f05 (cross-report matching keyed on session run-ids ships a dead feature with green tests; drift compares per-phase MEANS, NaN-safe — malformed group contributes 0, null renders "new")
- test/source-hygiene.test.js — confidence 0.7 | daf7f05 (a location rule with zero real-tree matches passes vacuously — pin known artifact locations positively beside the synthetic offender)
- engine/bin (shim convention) — confidence 0.7 | 5451144 (engine bins are 5-line shims over engine/src/<name>-main.js; put bin logic in engine/src so Stryker covers it — mutate scope is engine/src/** ONLY, bin files are never mutated; bin spawn-smoke tests belong in engine/test/<name>.bin.test.js. Do NOT relocate a bin's tests to repo-root test/ on a mutation-coverage rationale — that argument is void since bins aren't mutated.)

## part-sizing
- pure-module: pass — confidence 1 | a4849a1
- validator: pass — confidence 1 | a4849a1
- docs-prose: pass — confidence 1 | a4849a1
- resolver-wiring: pass — confidence 1 | a4849a1
- bash-helper: pass — confidence 1 | a4849a1 (re-observed in P27 — lock rename + grep-gate bats)
- test-helper: pass — confidence 1 | 3078c6e (P28 — with-cwd.js / empty-home.js isolators + unit tests)
- test-edit: pass — confidence 1 | 3078c6e (P28 — A2/A3/A4 hermeticity wraps, count-neutral)
- bats-guard: pass — confidence 1 | 3078c6e (P28 — hermetic-suite.bats + ci.sh repo-root step)
- security-module: pass — confidence 1 | f17d07e (contain.js realpath containment, symlink-escape tests via real fs.symlinkSync in mktemp)
- schema-module: pass — confidence 1 | f17d07e (dod.js parse/classify/assert-vs-evidence, injection-safe)
- structure-lint: pass — confidence 1 | f17d07e (backlog-lint/design-lint bash, execFileSync fixture tests)
- examples-adapter: pass — confidence 1 | f17d07e (github-issues via extends.backlog-adapters, host CLI confined to unscanned examples/)
- bats-port: pass — confidence 1 | f17d07e (12 bats→node:test, execFileSync runs real scripts, EXPECTED_PROC_TESTS guard)
- pure-aggregate-core: pass — confidence 1 | 71d0d40 (P29 usage-aggregate.js — vendor-neutral core over UsageEvent[]; deep-sorted byte-stable serialize; deterministic, time-from-event-data; 92.83% mutation)
- pricing-data-binding: pass — confidence 1 | 71d0d40 (P29 pricing-claude.js — DEFAULT_PRICES + --prices field-level merge + [1m] normalize; model-id literals OK in binding, hygiene bans only mutation-tooling+gh; 100% mutation)
- jsonl-parse-binding: pass — confidence 1 | 71d0d40 (P29 telemetry-claude.js — streaming parseLines/eventFromRollup, both Agent/Task shapes, redaction by positive field-selection; 96.49% mutation)
- cli-streaming-entrypoint: pass — confidence 1 | 71d0d40 (P29 usage-mine-main.js+bin — readline streaming, two-root containByRealpath, advisory no-op exit 0; injected io makes every error-path catch unit-testable)
- front-door-skill: pass — confidence 1 | 71d0d40 (P29 skills/metrics — zero-arg, mirrors craft:init, advisory; doc error-table must say exit-0/continue, never STOP)
- adapter-port-doc: pass — confidence 1 | 71d0d40 (P29 docs/adapters/telemetry.md — mirrors memory.md; report.json schema must byte-match serializeReport sortDeep output)
- relocation: pass — confidence 1 | daf7f05 (observability carve-out — 6 git-mv movers, import retargets only, suite unmodified)
