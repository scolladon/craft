/**
 * Launch-args posture for the `aider` subprocess (one craft phase = one headless turn).
 *
 * The non-interactivity flags are REQUIRED — without `--yes-always` a headless run in a
 * git repo blocks on the "Add .aider* to .gitignore?" prompt and crashes on non-terminal
 * stdin (`KeyError: '0 is not registered'`, pinned in the poc-record).
 *
 * Aider has no working-dir flag: cwd IS the git root, set by the runner as the spawn
 * `cwd` (out of this module's scope) — no `--workspace`/`--working-dir`/`--cwd` token
 * is ever emitted here.
 */
const FLAG_YES_ALWAYS = '--yes-always';
const FLAG_NO_GITIGNORE = '--no-gitignore';
const FLAG_NO_CHECK_UPDATE = '--no-check-update';
const FLAG_NO_SHOW_RELEASE_NOTES = '--no-show-release-notes';
const FLAG_NO_ANALYTICS = '--no-analytics';
const FLAG_MODEL = '--model';
const FLAG_READ = '--read';
const FLAG_MESSAGE = '--message';

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`buildLaunchArgs: ${label} must be a non-empty string`);
  }
}

/**
 * A tier that resolved to no model must never be forwarded as an empty `--model` value
 * (Aider would fall back silently to a default, changing which model ran).
 * @param {string} model
 */
function assertModel(model) {
  if (typeof model !== 'string' || model === '') {
    throw new Error('buildLaunchArgs: model must be a non-empty string (resolve the tier first)');
  }
}

/**
 * @param {unknown[]} readFiles
 * @returns {string[]} discrete `--read`,`<file>` pairs, one per entry, never interpolated
 */
function buildReadPairs(readFiles) {
  return readFiles.flatMap((file) => {
    assertNonEmptyString(file, 'each readFiles entry');
    return [FLAG_READ, file];
  });
}

/**
 * Build the argv array for an `aider` subprocess invocation.
 *
 * @param {{ model: string, readFiles?: string[], message: string }} opts
 * @returns {string[]} argv suitable for execFile('aider', [...args])
 */
export function buildLaunchArgs({ model, readFiles = [], message }) {
  assertModel(model);
  assertNonEmptyString(message, 'message');

  return [
    FLAG_YES_ALWAYS,
    FLAG_NO_GITIGNORE,
    FLAG_NO_CHECK_UPDATE,
    FLAG_NO_SHOW_RELEASE_NOTES,
    FLAG_NO_ANALYTICS,
    FLAG_MODEL,
    model,
    ...buildReadPairs(readFiles),
    FLAG_MESSAGE,
    message,
  ];
}
