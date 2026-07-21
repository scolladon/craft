import { resolve, sep } from 'node:path';
import { gitExtDiffPredicate } from './git-ext-diff-predicate.js';

// Binding-neutral predicate shared by every guard binding (pi, copilot, and beyond).
// Tools whose file_path writes must stay inside the working directory.
export const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

// Tools whose Bash command must be checked for git diff/show without --no-ext-diff.
const BASH_TOOL = 'Bash';

/**
 * Pure predicate that enforces the mechanical guards Claude applies via PreToolUse hooks.
 * Mirrors hooks/git-no-ext-diff.sh and the path-containment guard.
 *
 * @param {{ tool: string, tool_input: object, working_dir: string }} event
 * @returns {{ block: boolean, reason?: string }}
 */
export function toolCallGuard(event) {
  const { tool, tool_input, working_dir } = event;

  if (tool === BASH_TOOL) {
    return guardBashCommand(tool_input.command ?? '');
  }

  if (WRITE_TOOLS.has(tool)) {
    return guardWritePath(tool_input.file_path ?? '', working_dir);
  }

  return { block: false };
}

function guardBashCommand(command) {
  return gitExtDiffPredicate(command);
}

function guardWritePath(filePath, workingDir) {
  const resolvedWorking = resolve(workingDir);
  const resolvedFile = resolve(resolvedWorking, filePath);

  if (resolvedFile === resolvedWorking || resolvedFile.startsWith(resolvedWorking + sep)) {
    return { block: false };
  }

  return { block: true };
}
