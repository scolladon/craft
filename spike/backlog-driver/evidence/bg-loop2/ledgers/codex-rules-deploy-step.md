# craft run record (append-only)
codex-rules-deploy-step resolve RESOLVE: --policy push=always --policy propose=always --policy integrate=always --policy teardown=always
codex-rules-deploy-step resolve default-skip: requirements (descriptor enabled:false)
codex-rules-deploy-step resolve enable: architecture (phases.architecture.enabled:true)
codex-rules-deploy-step resolve CONFIG: manifest .claude/workflow.md (no --config); manifest-lint valid
codex-rules-deploy-step resolve MEMORY-LOAD: .claude/craft-memory.md loaded (toolchain npm, gate-cmd bash scripts/ci.sh, part-sizing docs-prose pass)
codex-rules-deploy-step resolve INTENTION-LOAD: zero-config corpus (specs, DESIGN-*, DOD, customizing, governing ADRs)
codex-rules-deploy-step resolve PROOF: git grep 'CODEX_HOME/rules' -> no hit in adapters/codex/README.md; Configure section adapters/codex/README.md:85-92 names only config.toml
codex-rules-deploy-step resolve AWAITING(propose): validation,architecture
codex-rules-deploy-step workspace PHASE-START(workspace): 2026-10-16T13:26:33Z
codex-rules-deploy-step workspace PHASE-DONE(workspace): worktree ../craft-codex-rules-deploy-step on docs/codex-rules-deploy-step; npm deps installed (engine nested)
codex-rules-deploy-step workspace POLICY(isolate): always -> proceed
codex-rules-deploy-step design PHASE-START(design): 2026-10-16T13:26:57Z
codex-rules-deploy-step design PHASE-DONE(design): a716287 docs/contributing/design/codex-rules-deploy-step.md (+README 73 design docs); 4 decision candidates
codex-rules-deploy-step design PROBE(design): orchestrator re-ran copy-vs-symlink load detector on codex 0.162.1 in throwaway CODEX_HOME: copy -> Error loading rules 2/2, symlink -> not loaded (401) 2/2; ~/.codex untouched (0)
codex-rules-deploy-step decisions PHASE-START(decisions): 2026-10-16T13:45:00Z
codex-rules-deploy-step decisions inline: decisions — ran in-session
codex-rules-deploy-step decisions DECISION(1): cp not symlink — adopted-as-recommended (evidence + ADR-599 post-copy branch) -> ADR-601 4a54dae
codex-rules-deploy-step decisions DECISION(2): cmp verification — adopted-as-recommended (ADR-599, ADR-600) -> ADR-602 6f4875b
codex-rules-deploy-step decisions DECISION(3): Configure-scoped pins + negative ln -s pin — adopted-as-recommended (existing negative-pin precedent) -> ADR-603 898379f
codex-rules-deploy-step decisions DECISION(4): POC record rows — escalated (scope beyond brief), user ratified recommendation -> ADR-604 c0cbb25
codex-rules-deploy-step decisions PHASE-DONE(decisions): 4 ADRs (601-604), 1 user fork ratified; no deviation -> no design revision; adr-lint OK
codex-rules-deploy-step planning PHASE-START(planning): 2026-10-16T14:10:17Z
codex-rules-deploy-step planning PHASE-DONE(planning): 9443553 docs/contributing/plan/codex-rules-deploy-step.md, 2 parts (+README 72 plans); plan-lint OK
codex-rules-deploy-step planning GATE(planning): green
codex-rules-deploy-step planning PLAN-CANDIDATE(1): negative-pin regex catches ln -sf/-fs — adopted (implements ADR-603 intent, no user judgment)
codex-rules-deploy-step planning PLAN-CANDIDATE(2): six POC rows (L1-L4, V2, V1/V3/V4) — adopted (within ADR-604 "the observations", no user judgment)
codex-rules-deploy-step implementation PHASE-START(implementation): 2026-10-16T14:21:11Z
codex-rules-deploy-step implementation PART(1): b2622e5 size=src-suite outcome=pass
codex-rules-deploy-step implementation PART(2): dca0156 size=docs-prose outcome=pass
codex-rules-deploy-step implementation GATE(implementation): green
codex-rules-deploy-step implementation PHASE-DONE(implementation): 2 parts landed (b2622e5, dca0156); bash scripts/ci.sh exit 0
codex-rules-deploy-step review PHASE-START(review): 2026-10-16T14:25:15Z
codex-rules-deploy-step review FINDINGS(perf): c1 /Users/scolladon/.claude/jobs/01350b6e/tmp/craft-review.qinW29/perf.c1.json n=0
codex-rules-deploy-step review FINDINGS(security): c1 /Users/scolladon/.claude/jobs/01350b6e/tmp/craft-review.qinW29/security.c1.json n=2
codex-rules-deploy-step review FINDINGS(code): c1 /Users/scolladon/.claude/jobs/01350b6e/tmp/craft-review.qinW29/code.c1.json n=4
codex-rules-deploy-step review FINDINGS(tests): c1 /Users/scolladon/.claude/jobs/01350b6e/tmp/craft-review.qinW29/tests.c1.json n=4
codex-rules-deploy-step review FIX(review): 53f2af1 all 10 c1 findings applied (security MEDIUM cp-through-symlink: rm -f + test ! -L; tests MEDIUM negative pin: showsSymlinkIntoRules predicate + 7 spelling vectors; LOWs: anchored sectionAfter, module-level readConfigureSection, deploy-sentence pin, mkdir pin, narrowed codex-error claim); ADR-602 amended
codex-rules-deploy-step review GATE(review-batch): green (bash scripts/ci.sh exit 0; native-surface 148/0; hand lenses each RED)
codex-rules-deploy-step review CONVERGED(code): c1 LOW-only
codex-rules-deploy-step review CONVERGED(perf): c1 zero findings
codex-rules-deploy-step review FINDINGS(tests): c2 /Users/scolladon/.claude/jobs/01350b6e/tmp/craft-review.qinW29/tests.c2.json n=2
codex-rules-deploy-step review FINDINGS(security): c2 /Users/scolladon/.claude/jobs/01350b6e/tmp/craft-review.qinW29/security.c2.json n=0
codex-rules-deploy-step review RULED-OUT(tests): c2 ln --sym abbreviation / variable-held RULES path / CRLF continuation / cp -s — unlikely in this README, examined not a defect
codex-rules-deploy-step review FIX(review): c2 tests LOW applied — LN_COMMAND boundary adds backtick and slash, 2 vectors (inline code, /bin/ln); native-surface 150/0
codex-rules-deploy-step review GATE(review): green (bash scripts/ci.sh exit 0)
codex-rules-deploy-step review CONVERGED(security): c2 zero findings, both c1 findings RESOLVED
codex-rules-deploy-step review CONVERGED(tests): c2 LOW-only (applied), 4 c1 findings RESOLVED
codex-rules-deploy-step review PHASE-DONE(review): 4 dimensions converged in 2 cycles; 2 MEDIUM + 9 LOW fixed (53f2af1, plus c2 LOW commit)
codex-rules-deploy-step refactoring PHASE-START(refactoring): 2026-10-16T14:55:00Z
codex-rules-deploy-step refactoring inline: refactoring — ran in-session (scan + scoping)
codex-rules-deploy-step refactoring NO-OP(refactoring): nothing cleared the bar — only cross-cutting candidate is three section-slicing helpers (adapters/codex/test/native-surface.test.js:94, test/community-scaffolding.test.js:24, test/readme-comparison.test.js:18); sharing them would make the self-contained ESM adapter package import a CommonJS root test helper across the package boundary for ~6 lines each
codex-rules-deploy-step refactoring PHASE-DONE(refactoring): no-op
codex-rules-deploy-step validation auto-skip: validation — evaluated unnecessary (no mutable code changed in scope: no touched file matches engine/stryker.conf.json mutate globs; changes are README/docs + adapters/codex/test/native-surface.test.js)
codex-rules-deploy-step validation auto-skip: architecture — evaluated unnecessary (no import/module-boundary edits since implementation; native-surface.test.js imports unchanged)
codex-rules-deploy-step documentation PHASE-START(documentation): 2026-10-16T15:00:00Z
codex-rules-deploy-step documentation inline: documentation — ran in-session (no affected pages beyond adapters/codex/README.md, already updated in implementation; adapters/README.md row still accurate)
codex-rules-deploy-step documentation POLICY(backlog-write): always -> proceed
codex-rules-deploy-step documentation BACKLOG(flip): 9c29368 entry retitled "— delivered 2026-10-16" with delivery summary (prose-entry convention; ticker not used — no checkbox)
codex-rules-deploy-step documentation FOLLOW-UPS: none surfaced (tests c2 RULED-OUT spellings are not defects; ADR-601 revisit triggers are conditions, not work)
codex-rules-deploy-step documentation PHASE-DONE(documentation): backlog flip committed; gate green
codex-rules-deploy-step propose PHASE-START(propose): 2026-10-16T15:10:00Z
codex-rules-deploy-step propose GATE(propose): green (pre-PR gate = bash scripts/ci.sh exit 0 at 9c29368; prose-lint advisory clean; AI-trace scan clean)
codex-rules-deploy-step propose AWAITING-RELEASED(propose): validation (auto-skip), architecture (auto-skip)
codex-rules-deploy-step propose POLICY(always:push): proceed — pushed docs/codex-rules-deploy-step
codex-rules-deploy-step propose POLICY(always:propose): proceed — https://github.com/scolladon/craft/pull/70
codex-rules-deploy-step propose PHASE-DONE(propose): PR #70 opened
codex-rules-deploy-step integrate PHASE-START(integrate): 2026-10-16T15:15:00Z
codex-rules-deploy-step integrate GATE(integrate): green (CI ci/links/readme-drift pass on both runs)
codex-rules-deploy-step integrate POLICY(always:integrate): proceed — PR #70 squash-merged a56c878 (--admin, --delete-branch; remote branch deleted)
codex-rules-deploy-step integrate POLICY(always:teardown): proceed
codex-rules-deploy-step integrate TEARDOWN: worktree removed, local branch deleted; main fast-forwarded to a56c878
codex-rules-deploy-step integrate PHASE-DONE(integrate): PR #70 merged a56c878; worktree torn down
codex-rules-deploy-step done MEMORY-SAVE: ok via load()/save() — toolchain 5, gate-cmd 5/5, part-sizing docs-prose 4->5, src-suite 2->3, test-infra 2->1, validation-tool 1->evicted; memory-store floor part-sizing 3->2 re-derived
codex-rules-deploy-step done METRICS: emit-metrics appended design, planning, implementation, review rows; no compaction line
codex-rules-deploy-step done BOOKKEEPING: 4c5b94b chore(metrics): record the codex-rules-deploy-step run pushed to main
codex-rules-deploy-step done NEXT-ELECTED: ADR-253 supersession (symlink route) -> .claude/driver-state-bg2/entry-1.next-elected.md
