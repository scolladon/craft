import { resolve, sep } from 'node:path';

// Binding-neutral predicate shared by every guard binding (pi, copilot, and beyond).
// Tools whose file_path writes must stay inside the working directory.
export const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

// Tools whose Bash command must be checked for git diff/show without --no-ext-diff.
const BASH_TOOL = 'Bash';

// Patterns that make a bash command exempt from the git ext-diff check.
const COMPLIANT_MARKERS = ['--no-ext-diff', 'rtk proxy'];

// Regex mirroring hooks/git-no-ext-diff.sh: matches git diff/show invocations,
// allowing global options (-C, -c, --git-dir=, --work-tree=) between git and the subcommand.
// Does NOT match `git stash show`, `git show-ref`, `git difftool`.
const GIT_DIFF_SHOW_RE =
  /(^|[;&|]\s*)git(\s+(-C\s+\S+|-c\s+\S+|--git-dir=\S+|--work-tree=\S+))*\s+(diff|show)(\s|$)/;

const REASON_GIT_EXT_DIFF =
  'git diff/show must carry --no-ext-diff (external diff mangles parsed output)';

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
  if (COMPLIANT_MARKERS.some((marker) => command.includes(marker))) {
    return { block: false };
  }

  if (!GIT_DIFF_SHOW_RE.test(command)) {
    return { block: false };
  }

  return { block: true, reason: REASON_GIT_EXT_DIFF };
}

function guardWritePath(filePath, workingDir) {
  const resolvedWorking = resolve(workingDir);
  const resolvedFile = resolve(resolvedWorking, filePath);

  if (resolvedFile === resolvedWorking || resolvedFile.startsWith(resolvedWorking + sep)) {
    return { block: false };
  }

  return { block: true };
}
