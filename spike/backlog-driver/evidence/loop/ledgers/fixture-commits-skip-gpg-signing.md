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
