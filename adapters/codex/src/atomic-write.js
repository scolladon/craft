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
 * inherited mode, an unreadable target — is exercisable without touching a
 * real `$CODEX_HOME`.
 */

const TEMP_FILE_SUFFIX = '.craft-trust-hook.tmp';
const MISSING_FILE_ERROR_CODE = 'ENOENT';
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

/**
 * @param {{ writeFile: Function, rename: Function, chmod: Function, stat: Function }} deps
 * @returns {(path: string, text: string) => void}
 */
export function createAtomicWriter({ writeFile, rename, chmod, stat }) {
  return function writeFileAtomically(path, text) {
    const mode = resolveFileMode(stat, path);
    const temporaryPath = `${path}${TEMP_FILE_SUFFIX}`;

    writeFile(temporaryPath, text, { mode });
    // `mode` on the write only applies when it creates the file, so a leftover
    // temporary file from an interrupted run would keep its old permissions.
    chmod(temporaryPath, mode);
    rename(temporaryPath, path);
  };
}
