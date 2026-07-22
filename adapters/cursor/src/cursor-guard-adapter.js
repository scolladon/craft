/**
 * beforeShellExecution event adapter for the Cursor binding: reshapes a Cursor
 * `beforeShellExecution` HOOK PAYLOAD into the event shape
 * `engine/src/guards/tool-call-guard.js`'s toolCallGuard expects, then applies
 * that predicate unmodified (never re-implemented here).
 *
 * The payload shape is pinned LIVE (dumped from the real hook stdin, cursor-agent
 * 2026.07.20): the executed command sits at TOP-LEVEL `command` (snake_case), NOT
 * `tool_input.command` — the exact trap the codex binding hit with a Claude-shaped
 * payload. `cwd` was observed empty on a real turn, so the working dir falls back to
 * `workspace_roots[0]`. The shell/git-ext-diff path does not read working_dir, but a
 * resolvable root is still supplied so the shape is complete.
 *
 * The guard binds ONLY the shell path: Cursor's pre-execution hook surface for shell
 * is `beforeShellExecution`; there is no pre-write ("beforeWriteFile") hook to enforce
 * path containment against (only `afterFileEdit`, which fires post-hoc). So this binding
 * enforces the git-ext-diff predicate on shell calls and does not claim pre-write
 * containment — an honest scope, recorded in the PoC.
 */
import { toolCallGuard } from '../../../engine/src/guards/tool-call-guard.js';

const BASH_TOOL_NAME = 'Bash';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// A beforeShellExecution payload with no string `command` is malformed — the hook
// is registered only on that event, so every firing should carry one. Rather than
// treat it as "nothing to check", it throws and decideGuard's catch converts that
// into the documented fail-closed verdict.
function requireCommand(command) {
  if (!isNonEmptyString(command)) {
    // equivalent mutant (StringLiteral ""): decideGuard's bare catch discards this
    // Error and returns { block: true }, so no caller can observe the message text.
    throw new Error('adaptCursorEvent: beforeShellExecution payload carries no string command');
  }
  return command;
}

// cwd is preferred, but was observed empty on a real turn; workspace_roots[0] is the
// pinned fallback. Neither is read by the shell/git branch of toolCallGuard, so an
// empty tail is acceptable — this never silently contains a Write against the wrong root
// because this binding routes only the Bash branch.
function resolveWorkingDir(cwd, workspaceRoots) {
  if (isNonEmptyString(cwd)) {
    return cwd;
  }
  if (Array.isArray(workspaceRoots) && isNonEmptyString(workspaceRoots[0])) {
    return workspaceRoots[0];
  }
  return '';
}

/**
 * Adapts a Cursor beforeShellExecution hook payload to toolCallGuard's event shape.
 * Throws on a payload missing a string `command`.
 * @param {{ command: string, cwd?: string, workspace_roots?: string[] }} payload
 * @returns {{ tool: string, tool_input: { command: string }, working_dir: string }}
 */
export function adaptCursorEvent(payload) {
  const { command, cwd, workspace_roots } = payload ?? {};
  return {
    tool: BASH_TOOL_NAME,
    tool_input: { command: requireCommand(command) },
    working_dir: resolveWorkingDir(cwd, workspace_roots),
  };
}

/**
 * Decides the enforcement verdict for a Cursor beforeShellExecution payload. Never
 * throws: any structurally hostile payload (missing/non-string command, a throwing
 * guard) fails CLOSED with a returned `{ block: true }` verdict. The hook wraps this
 * verdict into a stdout-JSON `permission:"deny"`; the hooks.json `failClosed:true`
 * is the separate backstop for a process-level crash before this returns.
 * @param {object} payload
 * @param {(event: object) => { block: boolean, reason?: string }} [guard]
 * @returns {{ block: boolean, reason?: string }}
 */
export function decideGuard(payload, guard = toolCallGuard) {
  try {
    return guard(adaptCursorEvent(payload));
  } catch {
    return { block: true };
  }
}
