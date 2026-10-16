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
