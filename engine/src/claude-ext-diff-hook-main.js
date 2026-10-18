import { gitExtDiffPredicate } from './guards/git-ext-diff-predicate.js';

export const ALLOW_VERDICT = 'allow';

const UNREADABLE_COMMAND_EXIT = 1;
const UNREADABLE_COMMAND_MESSAGE = 'claude-ext-diff-verdict: tool_input.command is not a string inside JSON objects\n';
const REASON_PREFIX = 'craft: ';
// equivalent mutant (StringLiteral "Stryker was here!"): the ext-diff rule allows any non-git command, so any such string yields the same allow verdict as ''.
const NO_COMMAND = '';
const UNREADABLE = null;
const COMMAND_PATH = Object.freeze(['tool_input', 'command']);

const isAbsent = value => value === undefined || value === null;
// Asked only of a value already known not to be absent, so null never reaches it.
const isIndexable = value => typeof value === 'object' && !Array.isArray(value);

// Reads the command the way `jq '.tool_input.command // empty'` does: an absent or null step
// is no command, and stepping into anything but an object is unreadable.
function commandOf(payload) {
  let value = payload;
  for (const key of COMMAND_PATH) {
    if (isAbsent(value)) return NO_COMMAND;
    if (!isIndexable(value)) return UNREADABLE;
    value = value[key];
  }
  if (isAbsent(value)) return NO_COMMAND;
  return typeof value === 'string' ? value : UNREADABLE;
}

const prefixed = reason => (reason.startsWith(REASON_PREFIX) ? reason : `${REASON_PREFIX}${reason}`);

const denyJson = reason =>
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: prefixed(reason) },
  });

/**
 * Judges a Claude Code PreToolUse(Bash) payload with the engine's ext-diff rule and writes
 * exactly one verdict token on stdout, with no trailing newline: the allow token or the deny JSON.
 * @param {string[]} _argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void }, readStdin: () => string }} io
 * @returns {number} exit code
 */
export function main(_argv, io) {
  const command = commandOf(JSON.parse(io.readStdin()));
  if (command === UNREADABLE) {
    io.stderr.write(UNREADABLE_COMMAND_MESSAGE);
    return UNREADABLE_COMMAND_EXIT;
  }
  const verdict = gitExtDiffPredicate(command);
  io.stdout.write(verdict.block ? denyJson(verdict.reason) : ALLOW_VERDICT);
  return 0;
}
