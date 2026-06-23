/**
 * Named-manifest config path resolver.
 * Pure — no I/O, no file-existence check.
 * Validates the name is a safe kebab segment before joining.
 */

import { resolve as resolvePath, join } from 'node:path';

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * @param {string} repoRoot  absolute path to the repository root
 * @param {string} name      candidate config name
 * @returns {{ ok: true, path: string } | { ok: false, error: string }}
 */
export function resolveConfigPath(repoRoot, name) {
  if (!name || !KEBAB_RE.test(name)) {
    return { ok: false, error: `invalid config name "${name}": must match ^[a-z0-9]+(-[a-z0-9]+)*$` };
  }

  // The kebab pattern admits no path separators or dots, so `craft-${name}.md` is always
  // a single segment under `.claude/` — the resolved path cannot escape repoRoot.
  const target = resolvePath(join(resolvePath(repoRoot), '.claude', `craft-${name}.md`));
  return { ok: true, path: target };
}
