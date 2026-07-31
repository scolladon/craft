/**
 * Replace a file's contents in one indivisible step.
 *
 * The file this writes is the operator's own `config.toml`, and a truncating
 * write onto it has a window in which the file exists but its previous content
 * is gone: a crash, a full disk or a lost session inside that window leaves the
 * operator with a truncated config rather than either the old one or the new
 * one. Writing beside the target and renaming over it closes that window —
 * rename is atomic within a filesystem, which is why the temporary file is
 * created in the target's own directory rather than a system temp directory.
 *
 * Every filesystem call is injected, so each branch — an absent target, an
 * inherited mode, an unreadable target, a failed write or rename — is
 * exercisable without touching a real `$CODEX_HOME`.
 */

import { randomBytes } from 'node:crypto';

const TEMP_FILE_INFIX = '.craft-trust-hook.';
const TEMP_FILE_SUFFIX = '.tmp';
const TEMP_NAME_BYTES = 6;
// Nothing may be written through a path that already exists: a planted symlink
// there redirects the content, and a leftover file donates its own permissions.
const EXCLUSIVE_CREATE_FLAG = 'wx';
const MISSING_FILE_ERROR_CODE = 'ENOENT';
const EXISTING_FILE_ERROR_CODE = 'EEXIST';
const FILE_MODE_MASK = 0o777;

// An absent config is being created here for the first time, and it will carry
// the hashes that decide which hooks execute — so it starts readable only by
// the operator rather than inheriting whatever the umask allows.
export const PRIVATE_FILE_MODE = 0o600;

// An existing file keeps the mode the operator chose: this rewrites the
// content, and silently tightening or loosening their permissions would be a
// change they never asked for.
function resolveFileMode(stat, path) {
  try {
    return stat(path).mode & FILE_MODE_MASK;
  } catch (error) {
    if (error.code === MISSING_FILE_ERROR_CODE) {
      return PRIVATE_FILE_MODE;
    }
    throw error;
  }
}

// A config.toml managed by a dotfiles tool is a symlink, and renaming over the
// link replaces it with a regular file while leaving the operator's real file
// untouched — the write reports success and changes nothing they will ever read.
// stat follows the link, so resolving here is also what keeps the mode this
// writes under and the file it writes to talking about the same inode. An absent
// target has nothing to resolve and is created at the path as given.
function resolveTargetPath(realpath, path) {
  try {
    return realpath(path);
  } catch (error) {
    if (error.code === MISSING_FILE_ERROR_CODE) {
      return path;
    }
    throw error;
  }
}

// Unguessable per run, so no earlier run, concurrent run or third party can be
// sitting on the path this one is about to create.
function toTemporaryPath(targetPath) {
  const token = randomBytes(TEMP_NAME_BYTES).toString('hex');
  return `${targetPath}${TEMP_FILE_INFIX}${token}${TEMP_FILE_SUFFIX}`;
}

// A cleanup that is itself unsafe is worse than a leak: an exclusive create that
// failed because the path was already taken created nothing there, so removing
// that path would delete a file this run does not own. An already-absent
// temporary file is the state being aimed at, and any other cleanup failure is
// reported alongside the failure that caused it rather than in place of it.
function discardTemporaryFile({ unlink, temporaryPath, error }) {
  if (error.code === EXISTING_FILE_ERROR_CODE) {
    return;
  }
  try {
    unlink(temporaryPath);
  } catch (cleanupError) {
    if (cleanupError.code === MISSING_FILE_ERROR_CODE) {
      return;
    }
    throw new Error(
      `${error.message} — and the temporary file ${temporaryPath} was left behind: ${cleanupError.message}`,
      { cause: error }
    );
  }
}

/**
 * @param {{ writeFile: Function, rename: Function, chmod: Function, stat: Function,
 *   realpath: Function, unlink: Function }} deps
 * @returns {(path: string, text: string) => void}
 */
export function createAtomicWriter({ writeFile, rename, chmod, stat, realpath, unlink }) {
  return function writeFileAtomically(path, text) {
    const targetPath = resolveTargetPath(realpath, path);
    const mode = resolveFileMode(stat, targetPath);
    const temporaryPath = toTemporaryPath(targetPath);

    try {
      writeFile(temporaryPath, text, { mode, flag: EXCLUSIVE_CREATE_FLAG });
      // `mode` on the write only applies when it creates the file, and an
      // umask can still narrow it, so the mode is asserted rather than assumed.
      chmod(temporaryPath, mode);
      rename(temporaryPath, targetPath);
    } catch (error) {
      discardTemporaryFile({ unlink, temporaryPath, error });
      throw error;
    }
  };
}
