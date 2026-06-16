---
name: workspace
description: Forge phase 1 - create the feature branch and worktree, install dependencies in-worktree, establish repo tooling preconditions.
---

# forge:workspace

## Preamble (always runs — non-overridable)

1. `"${CLAUDE_PLUGIN_ROOT}/scripts/manifest-lint.sh"` must pass; read the manifest.
2. Probe: git repo present (else STOP — forge needs one); default branch
   (`origin/HEAD` → `main` → `master` → ask once).

## Procedure (default body — a manifest `override:` replaces everything below)

1. Infer the branch type from the brief (`feat`/`fix`/`chore`, default `feat`).
2. Strategy `worktree` (default):
   ```bash
   git worktree add ../<repo>-<slug> -b <type>/<slug>
   "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-setup.sh" <abs-worktree-path> [manifest scripts.post-setup]
   ```
   Strategy `in-place` (manifest `workspace: { strategy: in-place }`): create the branch
   in the current checkout (`git switch -c <type>/<slug>`); deps assumed present or
   installed in place; later phases use the checkout root wherever they'd use the
   worktree (run-lock location included).
3. Branch or worktree path collision → STOP and ask; never reuse silently.
4. Apply the manifest's global/workspace `context:` file now: perform any tooling
   activation it declares (the session does this — agents will receive the same file
   and must find the tooling already active). Its teardown counterpart runs at integrate.
5. All subsequent work happens ONLY in this worktree/branch.
