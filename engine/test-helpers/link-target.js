import { readlinkSync } from 'node:fs';

/**
 * What the symlink at path names, or null once it is gone, so a swap test can prove the swap
 * happened instead of passing on a trigger that never fired.
 * @param {string} path
 * @returns {string | null}
 */
export function linkTargetOrNull(path) {
  try {
    return readlinkSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
