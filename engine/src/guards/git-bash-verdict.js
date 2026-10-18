/**
 * The git verdict for a Bash command, shared by the bindings whose hook judges
 * shell text: the plain-command gate first, then destructive git, then the
 * ext-diff rule, the last two over one parse of the command.
 */
import { gitPlainCommandGate } from './git-plain-command-gate.js';
import { destructiveVerdictFor } from './git-destructive-predicate.js';
import { extDiffVerdictFor } from './git-ext-diff-predicate.js';
import { gitInvocations, judgeParsed } from './shell-git-invocations.js';

function parsedGitVerdict(command) {
  const parsed = gitInvocations(command);
  const destructive = judgeParsed(parsed, destructiveVerdictFor);
  return destructive.block ? destructive : judgeParsed(parsed, extDiffVerdictFor);
}

/**
 * @param {string} command
 * @returns {{ block: boolean, reason?: string }}
 */
export function plainGitCommandVerdict(command) {
  const gate = gitPlainCommandGate(command);
  return gate.block ? gate : parsedGitVerdict(command);
}
