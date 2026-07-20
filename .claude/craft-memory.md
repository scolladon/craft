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
  - concern: findings
    file: engine/src/hygiene-lint-core.js
    severity: medium
    pattern: a size/DoS cap added to the scan-path read must ALSO cover the waiver-source read — ci.sh passes each touched .md as both a --waiver-source AND a scanned file, so collectWaived reads it whole (uncapped) before scanFile's guard ever applies; a huge touched markdown OOMs the gate. Extract ONE capped-read helper (statSync-then-skip-then-read) used by both paths; keep the distinct stderr label per path so existing 'cannot read waiver source' assertions stay green
    confidence: 0.75
    provenance:
      run: close-hygiene-lint-followups
      commit: aac0299
      date: '2026-07-04'
  - concern: findings
    file: scripts/ci.sh
    severity: medium
    pattern: 'to compute a git-diff touched set ONCE and feed two consumers while keeping git -z NUL-safety, use a NUL-delimited temp file read twice (printf ''%s\0'' + read -r -d '''' + trap rm EXIT) — bash cannot hold NUL in a variable and macOS bash 3.2 lacks readarray -d, so a shared newline-joined var re-loses -z''s guarantee for embedded-newline names. Also: ci.sh must NOT 2>/dev/null a resolver whose non-zero-exit carries a deliberate reason (a typo''d hygiene.gate would silently degrade to advisory); drop the suppression, keep || echo <default> as the fail-open'
    confidence: 0.75
    provenance:
      run: close-hygiene-lint-followups
      commit: aac0299
      date: '2026-07-04'
  - concern: findings
    file: engine/stryker.conf.json
    severity: medium
    pattern: extracting Stryker survivors with a fixed line-window (sed -n A,Bp over the report) silently clips survivors beyond the window and under-triages — grep the FULL report for '[Survived]'/'[No coverage]', and treat a scoped re-mutation of only the touched file as the authoritative post-triage check
    confidence: 0.8
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: engine/src/init-land-main.js
    severity: medium
    pattern: a default-dependency factory (execFileSync + stderr parse, e.g. buildLintDep) survives mutation because every unit test injects a fake dep away and the .bin subprocess test runs a fresh node the Stryker in-process instrumentation cannot observe — kill by exporting the factory and adding an in-process test driving the real dep against a real subprocess; genuinely-unreachable defensive fallbacks are documented equivalents
    confidence: 0.8
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: engine/src/config-resolve-main.js
    severity: medium
    pattern: an identity containByRealpath test-double (root,target)=>target turns the join(home,'.claude') path-literal and the scope-guard conditional into equivalent mutants — kill with a recording spy asserting the exact root arg for user scope and asserting containment is never consulted for local scope
    confidence: 0.8
    provenance:
      run: portable-named-configs
      commit: cb48a0c
      date: '2026-07-04'
  - concern: findings
    file: adapters/pi/src/tool-call-hook.js
    severity: high
    pattern: a field-bridge that prefers the guard's INSPECTED field over the field the tool actually EXECUTES on lets a decoy mask an escape — pi writes to `path`, so bridging `file_path ?? path` let an in-tree file_path decoy hide an out-of-tree path from the containment guard; bridge the authoritative field the tool acts on (map `path` to file_path unconditionally). Also: only map the tool names the shared predicate branches on (Bash/Write/Edit) — inert casing entries are dead code
    confidence: 0.7
    provenance:
      run: native-pi-binding
      commit: bb8d2cd
      date: '2026-07-20'
  - concern: findings
    file: adapters/pi/test/cli.test.js
    severity: medium
    pattern: cli.test.js spawns the REAL pi binary via spawnSync and is written for CI where pi is ABSENT (main exits 2 fast). In a dev sandbox where pi IS installed, the real spawn does slow network/provider work and the full adapters/pi suite / bash scripts/ci.sh hangs for tens of minutes. Reproduce CI conditions by prepending a fast-failing `pi` stub (a 2-line `exit 2` script) to PATH — node/npx stay real since they resolve elsewhere on PATH
    confidence: 0.8
    provenance:
      run: native-pi-binding
      commit: bb8d2cd
      date: '2026-07-20'
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
  - concern: part-sizing
    size: native-surface
    outcome: pass
    confidence: 1
    provenance:
      run: native-pi-binding
      commit: bd4d8d8
      date: '2026-07-20'
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
- adapters/pi/src/tool-call-hook.js — confidence 0.7 | bb8d2cd (a field-bridge that prefers the guard's INSPECTED field over the field the tool EXECUTES on lets a decoy mask an escape; pi writes `path`, so bridge `path`→file_path unconditionally; only map the tool names the shared predicate branches on — inert casing entries are dead code)
- adapters/pi/test/cli.test.js — confidence 0.8 | bb8d2cd (spawns the REAL pi via spawnSync, written for CI where pi is ABSENT → main exits 2 fast; in a dev sandbox with pi installed the spawn does slow provider work and the pi suite / ci.sh hangs tens of minutes — prepend a fast-failing `pi` stub (`exit 2`) to PATH to reproduce CI; node/npx stay real)

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
- self-govern-frontmatter: pass — confidence 1 | 8501bd2 (subjects: frontmatter on an in-corpus page + assertFresh dogfood test; docs+test folded, no src delta)
- bash-enumerator-single-source: pass — confidence 1 | 98e267e (living-corpus.sh emits LC_ALL=C-sorted paths; ci.sh + test both consume; compare as Set not ordered array)
- lint-bin-module: pass — confidence 1 | 1a04acc (stub/prose lint = 6-line bin shim + pure src main(argv,io) mirroring intention-lint; self-exclusion + generative-marker + advisory/blocking exit tests)
- manifest-enum-knob: pass — confidence 1 | 1cce5cc (hygiene.gate mirrors intention.gate: frozen set + validateHygiene + dispatch; init-emit.test.js keeps its OWN TOP_KEYS — do not touch)
- ci-advisory-wiring: pass — confidence 1 | 6ebaf71 (ci.sh compute_touched→run_stub/prose_lint advisory; kept non-adjacent to run_intention_lint; token family in skills/run; each touched .md is its own --waiver-source; expected benign self-reference)
- standalone-skill: pass — confidence 1 | 19c3379 (prose-only craft:prune skill mirroring craft:metrics; propose-never-dispose + core.md fail-closed denylist)
- lint-mutation-triage: pass — confidence 1 | 45b7c5a (per-hunk stryker on lint bins: killable = clean-file --gate blocking→exit0, unreadable --waiver-source, prose capitalized single-word; equivalent = gate-default '', isSelf/waived {} early-return, read-error found-flag — exit-OR aggregation makes found unobservable when readError dominates)
- native-surface: pass — confidence 1 | bd4d8d8 (pi package: package.json `pi` manifest + keywords + settings.template.json + thin prompt-template dispatchers + one thin .ts extension wrapping tested src seams + README + a structure test that reads the .ts as TEXT; single-sourced procedure bodies, no re-authoring)
