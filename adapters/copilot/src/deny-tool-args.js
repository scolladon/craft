/**
 * Enforcing guard layers for the Copilot adapter: the deny-tool pattern set
 * and the launch flags that pair it with native path containment.
 *
 * Both mechanisms are live-proven to actually block, unlike Copilot's
 * `preToolUse` hook (fires but cannot deny). `--deny-tool` patterns take
 * precedence even over `--allow-all-tools`; `--add-dir` extends the
 * contained path set. `--allow-all-paths` disables that containment
 * entirely and must never be emitted here.
 */

import { isAbsolute } from 'node:path';

// `--deny-tool` matches by PREFIX on the command string (pinned live against
// copilot 1.0.63) — it does not parse argv, so each destructive verb needs
// one literal pattern per flag order / long-form alias an agent actually
// emits. `shell(git:*)` would close that gap by denying ALL git, which is
// deliberately rejected: craft's own workflow runs git constantly, so a
// blanket deny would break the harness itself.
//
// Residual limitation, honestly stated: prefix matching cannot cover
// interposed global options — `git -C <dir> push`, `git --git-dir=… push`,
// `git -c k=v push` all bypass every pattern below (live-confirmed: `git -C .
// push` executed against `shell(git push)`; `git clean -df` executed against
// `shell(git clean -fd)` before this list added the flag-order variant).
// This layer is defence-in-depth against accidental destructive git, NOT an
// adversarial sandbox — never document it as one.
export const DENY_TOOL_PATTERNS = Object.freeze([
  'shell(git push)',
  'shell(git reset --hard)',
  'shell(git clean -fd)',
  'shell(git clean -df)',
  'shell(git clean -f -d)',
  'shell(git clean -d -f)',
  'shell(git clean --force)',
  'shell(git branch -D)',
  'shell(git branch --delete --force)',
  'shell(git branch -d --force)',
]);

/**
 * @param {string} workingDir
 */
function assertContainmentRoot(workingDir) {
  if (!workingDir || !isAbsolute(workingDir)) {
    throw new Error(
      `buildLaunchArgs: missing containment root — workingDir must be a non-empty absolute path, got "${workingDir}"`,
    );
  }
}

/**
 * Build the Copilot CLI launch argv that pairs headless tool access with
 * the two enforcing guard layers: deny-tool patterns and native path
 * containment. `--allow-all-paths` is deliberately never emitted.
 *
 * @param {{ workingDir: string }} params
 * @returns {string[]}
 */
export function buildLaunchArgs({ workingDir } = {}) {
  assertContainmentRoot(workingDir);

  return [
    '--allow-all-tools',
    '--add-dir',
    workingDir,
    ...DENY_TOOL_PATTERNS.map((pattern) => `--deny-tool=${pattern}`),
  ];
}
