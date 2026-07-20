/**
 * CRAFT_ROOT resolver for the Pi craft-guard extension.
 *
 * Self-locates the engine repo root from the extension module's own URL so
 * the extension can set `process.env.CRAFT_ROOT` before `session_start`
 * without relying on an externally-supplied path.
 */

import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

// The extension entry lives at adapters/pi/extensions/craft-guard/index.ts —
// craft-guard → extensions → pi → adapters → repo root is FOUR levels up.
// One level deeper than engine.js's three-up: engine.js sits in
// adapters/pi/src/, the extension sits one directory further, in
// adapters/pi/extensions/craft-guard/.
const UP_LEVELS_TO_REPO_ROOT = ['..', '..', '..', '..'];

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
 * Self-locate the repo root from the pi craft-guard extension module.
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
