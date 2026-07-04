/**
 * Pure decision/path computer for relocating a named config between scopes.
 * Never touches the filesystem itself — decides the source/destination paths
 * and whether the relocation may proceed; the caller composes the actual
 * copy/land/remove steps.
 */

import { join } from 'node:path';
import { resolveConfigPath } from './init-config.js';

const SCOPE_LOCAL = 'local';
const SCOPE_USER = 'user';

const CONTAINMENT_ERROR = 'user-scope path failed containment';

/**
 * @typedef {{ repoRoot: string, homeDir: string, fileExists: (p: string) => boolean, containByRealpath: (root: string, target: string) => string|null }} PlanDeps
 */

function verbForScope(fromScope) {
  return fromScope === SCOPE_USER ? 'demote' : 'promote';
}

/**
 * Local-scope paths pass through unchanged; only the user-scope side can
 * escape via a symlinked ~/.claude, so containment applies there only.
 */
function resolveScopedPath(scope, path, homeDir, containByRealpath) {
  if (scope !== SCOPE_USER) return path;
  return containByRealpath(join(homeDir, '.claude'), path);
}

function missingSourceError(name, fromScope) {
  return `no ${fromScope}-scope config ${name} to ${verbForScope(fromScope)}`;
}

function destinationExistsError(name, toScope) {
  return `destination craft-${name}.md exists at ${toScope} scope — pass --force to overwrite`;
}

/**
 * @param {{ name: string, demote?: boolean, force?: boolean }} args
 * @param {PlanDeps} deps
 * @returns {{ ok: true, sourcePath: string, destPath: string, fromScope: string, toScope: string, destScope: string, overwrote: boolean } | { ok: false, error: string }}
 */
export function planPromote({ name, demote = false, force = false }, deps) {
  const fromScope = demote ? SCOPE_USER : SCOPE_LOCAL;
  const toScope = demote ? SCOPE_LOCAL : SCOPE_USER;
  const sourceRoot = demote ? deps.homeDir : deps.repoRoot;
  const destRoot = demote ? deps.repoRoot : deps.homeDir;

  const srcRes = resolveConfigPath(sourceRoot, name);
  if (!srcRes.ok) return { ok: false, error: srcRes.error };

  const sourcePath = resolveScopedPath(fromScope, srcRes.path, deps.homeDir, deps.containByRealpath);
  if (sourcePath === null) return { ok: false, error: CONTAINMENT_ERROR };
  if (!deps.fileExists(sourcePath)) {
    return { ok: false, error: missingSourceError(name, fromScope) };
  }

  // name already validated above (root-independent regex), so destRes.ok is guaranteed here.
  const destRes = resolveConfigPath(destRoot, name);
  const destPath = resolveScopedPath(toScope, destRes.path, deps.homeDir, deps.containByRealpath);
  if (destPath === null) return { ok: false, error: CONTAINMENT_ERROR };

  const overwrote = deps.fileExists(destPath);
  if (overwrote && !force) return { ok: false, error: destinationExistsError(name, toScope) };

  return { ok: true, sourcePath, destPath, fromScope, toScope, destScope: toScope, overwrote };
}
