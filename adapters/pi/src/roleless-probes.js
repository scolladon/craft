import { spawnSync as _spawnSync, execFile as _execFile } from 'node:child_process';

/**
 * Run a command synchronously and return { ok, stdout }.
 * spawnSync is used for the boolean probes that roleless.js calls synchronously.
 *
 * @param {string} file
 * @param {string[]} args
 * @param {string} cwd
 * @param {Function} spawnSyncFn - injectable spawnSync for testing
 * @returns {{ ok: boolean, stdout: string }}
 */
function runSync(file, args, cwd, spawnSyncFn) {
  const result = spawnSyncFn(file, args, { cwd, encoding: 'utf8' });
  return { ok: result.status === 0, stdout: result.stdout ?? '' };
}

/**
 * Run a command asynchronously (for push / PR create side-effects).
 *
 * @param {string} file
 * @param {string[]} args
 * @param {string} cwd
 * @param {Function} execFileFn - injectable execFile
 * @returns {Promise<string>}
 */
function runAsync(file, args, cwd, execFileFn) {
  return new Promise((resolve, reject) => {
    execFileFn(file, args, { cwd, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Build production roleless probes for a given cwd.
 * All boolean probes (gitProbe.isGitRepo, hasRemote, ghAvailable, ghAuthed) are
 * synchronous — roleless.js evaluates them without awaiting.
 * Side-effect probes (gitPush, ghPrCreate) are async Promises.
 *
 * All probes are DI-overridable via the `rolelessProbes` dep key in wireDefaults.
 *
 * @param {{ cwd: string }} opts
 * @param {Function} [execFileFn] - injectable execFile for async side-effects; defaults to node:child_process execFile
 * @returns {{ gitProbe: object, hasRemote: Function, ghAvailable: Function, ghAuthed: Function, gitPush: Function, ghPrCreate: Function }}
 */
export function buildRolelessProbes({ cwd }, execFileFn = _execFile, spawnSyncFn = _spawnSync) {
  return {
    gitProbe: {
      // git rev-parse --is-inside-work-tree exits 0 inside a work-tree
      isGitRepo: () => runSync('git', ['rev-parse', '--is-inside-work-tree'], cwd, spawnSyncFn).ok,
    },
    // git remote yields non-empty output when at least one remote is configured
    hasRemote: () => runSync('git', ['remote'], cwd, spawnSyncFn).stdout.trim().length > 0,
    // gh --version exits 0 when the gh CLI is installed
    ghAvailable: () => runSync('gh', ['--version'], cwd, spawnSyncFn).ok,
    // gh auth status exits 0 when authenticated
    ghAuthed: () => runSync('gh', ['auth', 'status'], cwd, spawnSyncFn).ok,
    // Side-effect probes — async, may throw on failure
    gitPush: () => runAsync('git', ['push', '-u', 'origin', 'HEAD'], cwd, execFileFn),
    ghPrCreate: () => runAsync('gh', ['pr', 'create', '--fill'], cwd, execFileFn),
  };
}
