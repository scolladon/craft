/**
 * PreToolUse event adapter for the Antigravity binding: reshapes an Antigravity
 * PreToolUse HOOK PAYLOAD into the event shape
 * `engine/src/guards/tool-call-guard.js`'s toolCallGuard expects, then applies
 * that predicate unmodified (the predicate is reused, never re-implemented).
 *
 * The payload and field names are PINNED from the shipped `language_server`
 * assets, not assumed — the exact trap the codex guard hit:
 *   - Hook stdin payload:  { toolCall: { name, args } }
 *   - run_command args:    { CommandLine: "<shell command>", Cwd: "<dir>", ... }
 *     (PascalCase `CommandLine` — pinned from a live tool-call example embedded
 *     in the language_server; NOT `command`, which nobody would guess.)
 *
 * Only `run_command` is reshaped to the Bash branch (that is the sole tool the
 * git-ext-diff predicate acts on, and the hook matcher scopes firing to it);
 * every other tool passes through to the predicate's `{ block: false }` tail.
 */
import { toolCallGuard } from '../../../engine/src/guards/tool-call-guard.js';

// LOAD-BEARING ASSUMPTION (OPEN — pinned from a static binary read, not a live tool
// enumeration): `run_command` is Antigravity's sole shell-executing tool, so the
// hooks.json matcher scopes the guard to it. If Antigravity exposes another tool (or a
// run_command alias/variant) that runs a shell command, a `git diff` issued through it
// never reaches this guard. Widen the matcher + this branch once the live tool set is
// enumerated. See docs/contributing/specs/antigravity-poc-record.md.
const RUN_COMMAND_TOOL = 'run_command';
const BASH_TOOL = 'Bash';

// A fail-closed verdict must carry a NON-EMPTY reason so an Antigravity API drift
// surfaces as a visible denial (reason shown to user/agent) rather than silently
// disarming the guard — the opencode fail-open lesson inverted.
const FAIL_CLOSED_REASON =
  'craft-guard: unrecognised Antigravity tool-call payload (fail-closed)';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Reshape an Antigravity PreToolUse hook payload to toolCallGuard's event shape.
 * A non-run_command tool is a benign pass-through (empty tool_input hits the
 * predicate's non-Bash, non-write tail). A run_command call whose CommandLine is
 * not a non-empty string is a malformed payload — it throws, and decideGuard's
 * catch converts that into the documented fail-closed verdict.
 *
 * @param {{ toolCall: { name: string, args: object } }} payload
 * @returns {{ tool: string, tool_input: object, working_dir: string }}
 */
export function adaptAntigravityEvent(payload) {
  const toolCall = payload?.toolCall;
  if (toolCall === null || typeof toolCall !== 'object') {
    throw new Error('adaptAntigravityEvent: payload carries no toolCall object');
  }

  if (toolCall.name !== RUN_COMMAND_TOOL) {
    // Not the shell tool — the git-ext-diff predicate has no opinion; pass through.
    return { tool: toolCall.name, tool_input: {}, working_dir: '' };
  }

  const command = toolCall.args?.CommandLine;
  if (!isNonEmptyString(command)) {
    throw new Error('adaptAntigravityEvent: run_command call carries no CommandLine string');
  }
  const cwd = toolCall.args?.Cwd;
  return { tool: BASH_TOOL, tool_input: { command }, working_dir: isNonEmptyString(cwd) ? cwd : '' };
}

/**
 * Decide the enforcement verdict for an Antigravity PreToolUse payload. Never
 * throws: any structurally hostile payload fails CLOSED with a returned
 * `{ block: true, reason }` verdict carrying a non-empty, greppable reason.
 *
 * @param {object} payload
 * @param {(event: object) => { block: boolean, reason?: string }} [guard]
 * @returns {{ block: boolean, reason?: string }}
 */
export function decideGuard(payload, guard = toolCallGuard) {
  try {
    return guard(adaptAntigravityEvent(payload));
  } catch (err) {
    // Fail CLOSED, and carry the specific throw message into the reason so a real
    // Antigravity payload drift is diagnosable in the log (never a swallowed error).
    return { block: true, reason: `${FAIL_CLOSED_REASON}: ${err?.message ?? 'unknown'}` };
  }
}
