import { realpathSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

/**
 * Pick the plugin-context path to root CRAFT_ROOT on: worktree wins over directory.
 *
 * @param {{ worktree?: string, directory?: string }} ctx
 * @returns {string|undefined}
 */
function pickContextPath(ctx) {
  return ctx.worktree || ctx.directory;
}

/**
 * Resolve CRAFT_ROOT from an opencode plugin context.
 *
 * Fails loud on a missing/non-absolute/empty context path or a path
 * that does not exist on disk — the engine never reads CRAFT_ROOT
 * directly, so this seam is the only place the contract is enforced.
 *
 * @param {{ worktree?: string, directory?: string }} ctx
 * @param {{ realpathSync: Function, existsSync: Function }} fsOps
 * @returns {string}
 */
export function resolveCraftRoot(ctx, fsOps = { realpathSync, existsSync }) {
  const contextPath = pickContextPath(ctx);

  if (!contextPath) {
    throw new Error(`CRAFT_ROOT: plugin context has no worktree or directory (got: ${JSON.stringify(contextPath)})`);
  }

  if (!isAbsolute(contextPath)) {
    throw new Error(`CRAFT_ROOT: context path must be absolute, got "${contextPath}"`);
  }

  const candidate = resolve(contextPath);

  if (!fsOps.existsSync(candidate)) {
    throw new Error(`CRAFT_ROOT: path does not exist: "${candidate}"`);
  }

  return fsOps.realpathSync(candidate);
}
