/**
 * CRAFT_ROOT resolver for the Copilot adapter.
 *
 * Self-locates the engine repo root from the caller module's own URL so the
 * adapter can set `process.env.CRAFT_ROOT` before dispatching to the engine
 * without relying on an externally-supplied path.
 */

import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

// Both callers of this resolver — adapters/copilot/src/*.js and
// adapters/copilot/hooks/craft-observer.js — sit exactly three directories
// below the repo root, so a single shared up-walk depth covers both.
const UP_LEVELS_TO_REPO_ROOT = ['..', '..', '..'];

/**
 * Resolve moduleUrl to its absolute containing directory.
 * A moduleUrl that is not a valid file:// URL yields '', which fails the
 * absolute check below instead of throwing an uncaught URL error.
 *
 * @param {string} moduleUrl
 * @returns {string}
 */
function toAbsoluteModuleDir(moduleUrl) {
  let modulePath;
  try {
    modulePath = fileURLToPath(moduleUrl);
  } catch {
    modulePath = '';
  }
  if (!isAbsolute(modulePath)) {
    throw new Error(`resolveCraftRoot: moduleUrl "${moduleUrl}" did not resolve to an absolute path`);
  }
  return dirname(modulePath);
}

/**
 * @param {string} root
 * @param {{ existsSync: Function }} fsOps
 */
function assertRootExists(root, fsOps) {
  if (!fsOps.existsSync(root)) {
    throw new Error(`resolveCraftRoot: computed root "${root}" does not exist`);
  }
}

/**
 * @param {string} root
 * @param {{ existsSync: Function }} fsOps
 */
function assertContainsEngineBin(root, fsOps) {
  const engineBin = join(root, 'engine', 'bin');
  if (!fsOps.existsSync(engineBin)) {
    throw new Error(
      `resolveCraftRoot: computed root "${root}" does not contain engine/bin — wrong up-walk depth`,
    );
  }
}

/**
 * Self-locate the repo root from a Copilot adapter module.
 *
 * @param {string} moduleUrl - the caller's `import.meta.url`
 * @param {{ existsSync: Function, realpathSync: Function }} [fsOps]
 * @returns {string} the realpath'd, existing, engine-bin-containing repo root
 */
export function resolveCraftRoot(moduleUrl, fsOps = { existsSync, realpathSync }) {
  const moduleDir = toAbsoluteModuleDir(moduleUrl);
  const root = resolve(join(moduleDir, ...UP_LEVELS_TO_REPO_ROOT));

  assertRootExists(root, fsOps);
  assertContainsEngineBin(root, fsOps);

  return fsOps.realpathSync(root);
}
