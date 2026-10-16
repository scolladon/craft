# craft run record (append-only)
fixture-commits-skip-gpg-signing resolve RESOLVE: --policy push=always --policy propose=always --policy integrate=always --policy teardown=always
fixture-commits-skip-gpg-signing resolve default-skip: requirements (descriptor enabled:false)
fixture-commits-skip-gpg-signing resolve enable: architecture (phases.architecture.enabled:true)
fixture-commits-skip-gpg-signing resolve config: .claude/workflow.md (no --config); manifest-lint valid
fixture-commits-skip-gpg-signing resolve memory: load ok — toolchain 1, gate-cmd 2 (bash scripts/ci.sh), validation-tool 1, findings 3, part-sizing entries
fixture-commits-skip-gpg-signing resolve intention: consult ok — living corpus + governing lane (ADR-317, 348, 351-358)
fixture-commits-skip-gpg-signing resolve waivers: none
fixture-commits-skip-gpg-signing resolve AWAITING(propose): validation,architecture
fixture-commits-skip-gpg-signing workspace PHASE-START(workspace): 2026-10-16T08:14:55Z
fixture-commits-skip-gpg-signing workspace POLICY(isolate): always -> proceed
fixture-commits-skip-gpg-signing workspace TOOLCHAIN: npm (nested: engine) — lockfile unchanged vs memory hint
fixture-commits-skip-gpg-signing workspace PHASE-DONE(workspace): worktree ../craft-fixture-commits-skip-gpg-signing on fix/fixture-commits-skip-gpg-signing, deps installed
fixture-commits-skip-gpg-signing design PHASE-START(design): 2026-10-16T08:16:50Z
fixture-commits-skip-gpg-signing design PROOF: GIT_CONFIG_GLOBAL=<commit.gpgsign=true,gpg.program=false> → run-ledger.test.js 71/73 fail, worktree.test.js 9/9 fail, hooks.test.js 35 fail (shares test/helpers/craft-run.js); every other suite clean
fixture-commits-skip-gpg-signing design PHASE-DONE(design): 0b59fce docs/contributing/design/fixture-commits-skip-gpg-signing.md — D1(a) -c commit.gpgsign=false via test/helpers/commit-signing.js in both fixture wrappers; D2(a) per-fixture regression under withFailingCommitSigner; README design count 69→70; design-lint+ci green
fixture-commits-skip-gpg-signing decisions PHASE-START(decisions): 2026-10-16T08:27:17Z
fixture-commits-skip-gpg-signing decisions NO-OP(decisions): no user-judgment decisions — D1(a) per-command -c commit.gpgsign=false is the mechanism the brief names, shared via one helper per ADR-158; D2(a) per-fixture proof follows test/tmp-git-repo.test.js and avoids (b)'s added CI load, the trigger of the bug
fixture-commits-skip-gpg-signing decisions PHASE-DONE(decisions): ADR-597 abd2715, ADR-598 f3cf4b6, both adopted-as-recommended; README ADR count 596→598; adr-lint+readme-drift green
fixture-commits-skip-gpg-signing planning PHASE-START(planning): 2026-10-16T08:27:21Z
fixture-commits-skip-gpg-signing planning GATE(planning): green
fixture-commits-skip-gpg-signing planning PHASE-DONE(planning): c2b56b1 docs/contributing/plan/fixture-commits-skip-gpg-signing.md — 1 part (test-infra, 3 RED→GREEN cycles); plan-local P-1(a) local hermeticGitEnv copies, P-2(a) assert HEAD resolves — adopted as recommended; README plan count 68→69
fixture-commits-skip-gpg-signing implementation PHASE-START(implementation): 2026-10-16T08:34:10Z
fixture-commits-skip-gpg-signing implementation PART(1): 4bfa8ad size=test-infra outcome=pass
fixture-commits-skip-gpg-signing implementation VERIFY(1): porcelain clean; 3 new test files tracked; RED re-proved in throwaway (fix reverted → craft-run 0/1, worktree 9/10)
fixture-commits-skip-gpg-signing implementation GATE(implementation): green
fixture-commits-skip-gpg-signing implementation GUARD: hostile GIT_CONFIG_GLOBAL → run-ledger+hooks+worktree+craft-run+commit-signing 163/163 pass
fixture-commits-skip-gpg-signing implementation PHASE-DONE(implementation): 1/1 part landed; bash scripts/ci.sh exit 0, no not-ok
fixture-commits-skip-gpg-signing review PHASE-START(review): 2026-10-16T08:37:01Z
fixture-commits-skip-gpg-signing review FINDINGS(perf): c1 /var/folders/14/mbtb5mjx2js885cj0w6vkc940000gn/T//craft-review.RO56e3/perf.c1.json n=0
fixture-commits-skip-gpg-signing review FINDINGS(security): c1 /var/folders/14/mbtb5mjx2js885cj0w6vkc940000gn/T//craft-review.RO56e3/security.c1.json n=4
fixture-commits-skip-gpg-signing review RULED-OUT(security): 4 — env restore/temp cleanup, GIT_CONFIG_COUNT precedence, mkdtemp race, argv injection — all examined, not defects
fixture-commits-skip-gpg-signing review FINDINGS(code): c1 /var/folders/14/mbtb5mjx2js885cj0w6vkc940000gn/T//craft-review.RO56e3/code.c1.json n=1
fixture-commits-skip-gpg-signing review FINDINGS(tests): c1 /var/folders/14/mbtb5mjx2js885cj0w6vkc940000gn/T//craft-review.RO56e3/tests.c1.json n=3
fixture-commits-skip-gpg-signing review RULED-OUT(tests): vacuity check passed (not a defect); Object.freeze survivor — test/ is outside Stryker mutate scope (engine/stryker.conf.json:25-31), no mutant exists
fixture-commits-skip-gpg-signing review FIX(tests): a0a2cb2 createRunRepo cleans its parent and rethrows on a failed build — RED test (hooksPath pre-commit fails, TMPDIR scratch) left craft-run-* behind, GREEN after
fixture-commits-skip-gpg-signing review FIX(code): 981a291 allocWorktreeDirs() shared by setup() and the signer test; finally uses teardown()
fixture-commits-skip-gpg-signing review GATE(review): green
fixture-commits-skip-gpg-signing review PHASE-DONE(review): converged c1 (low-only) — code 1 LOW fixed, security 4 RULED-OUT, tests 1 LOW fixed + 2 RULED-OUT, perf 0
fixture-commits-skip-gpg-signing refactoring PHASE-START(refactoring): 2026-10-16T08:41:48Z
fixture-commits-skip-gpg-signing refactoring NO-OP(refactoring): nothing cleared the bar — considered centralising hermeticGitEnv() (now 3 new local copies + 3 pre-existing shapes); plan choice P-1(a) settled local copies so checks stay independent of the helpers under test, and a shared module would refactor untouched suites outside the brief; setup/teardown duplication already folded in review (981a291)
fixture-commits-skip-gpg-signing refactoring PHASE-DONE(refactoring): no-op
fixture-commits-skip-gpg-signing validation auto-skip: validation — evaluated unnecessary (no mutable code changed in scope: diff touches only test/ and docs, outside engine/stryker.conf.json mutate globs)
fixture-commits-skip-gpg-signing validation auto-skip: architecture — evaluated unnecessary (no import/module-boundary edits in the scanned engine/src observability graph; test-only + docs diff)
fixture-commits-skip-gpg-signing documentation PHASE-START(documentation): 2026-10-16T08:42:40Z
fixture-commits-skip-gpg-signing documentation POLICY(backlog-write): always -> proceed
fixture-commits-skip-gpg-signing documentation NO-OP(documentation-pages): no living page's subjects or stated behaviour match the test-only diff; design/ADR/plan already carry the change
fixture-commits-skip-gpg-signing documentation PHASE-DONE(documentation): b935ea2 backlog entry removed (repo convention: resolved entries leave BACKLOG.md); no follow-ups with proof surfaced
fixture-commits-skip-gpg-signing propose PHASE-START(propose): 2026-10-16T08:43:31Z
fixture-commits-skip-gpg-signing propose AWAITING(propose) released: validation (auto-skip), architecture (auto-skip)
fixture-commits-skip-gpg-signing propose GATE(propose): green — bash scripts/ci.sh exit 0; prose-lint advisory clean; no AI trace in commits/diff/body
fixture-commits-skip-gpg-signing propose POLICY(push): always -> proceed
fixture-commits-skip-gpg-signing propose POLICY(always:propose): proceed
fixture-commits-skip-gpg-signing propose PHASE-DONE(propose): PR https://github.com/scolladon/craft/pull/67
fixture-commits-skip-gpg-signing integrate PHASE-START(integrate): 2026-10-16T08:43:48Z
fixture-commits-skip-gpg-signing integrate CI(67): green — ci, links, readme-drift pass
fixture-commits-skip-gpg-signing integrate POLICY(always:integrate): proceed
fixture-commits-skip-gpg-signing integrate MERGED(67): 6114371 squash, branch deleted
fixture-commits-skip-gpg-signing integrate POLICY(teardown): always -> proceed
fixture-commits-skip-gpg-signing integrate TEARDOWN: worktree and local branch removed (script's trailing cd notice after removal is benign; git worktree list confirms)
fixture-commits-skip-gpg-signing integrate PHASE-DONE(integrate): PR #67 merged as 6114371; no skills/agents touched → no baseline-refresh offer
