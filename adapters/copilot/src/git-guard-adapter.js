/**
 * preToolUse event adapter for the Copilot binding: reshapes Copilot's lowercase
 * event (object or string-encoded toolArgs) into the shape toolCallGuard expects,
 * and decides the guard verdict by composing the destructive-git predicate with
 * that guard. The hook script turns the verdict into the CLI response.
 */
import { gitDestructivePredicate } from '../../../engine/src/guards/git-destructive-predicate.js';
import { toolCallGuard, WRITE_TOOLS } from '../../../engine/src/guards/tool-call-guard.js';

const BASH_TOOL = 'Bash';
const CONTAINMENT_DENIED_REASON = 'craft: write outside the working directory is denied in this binding';
const UNKNOWN_ERROR = 'unknown error';

// Maps Copilot's lowercase toolName to the Claude-cased names toolCallGuard
// branches on — only the tools the shared predicate actually guards (Bash for
// git-diff detection, Write/Edit for path containment). `view` is read-only
// (the predicate has no branch for it) and Copilot has no `notebookedit` tool,
// so neither gets an entry. Unmapped names pass through unchanged and hit the
// predicate's `{ block: false }` tail.
// Null-prototype so a toolName of "constructor"/"__proto__" can never resolve
// an inherited Object.prototype member instead of falling through to the raw
// name (the same own-property discipline as model-tier-map.js).
const COPILOT_TOOL_NAME_CASING = Object.freeze(
  Object.assign(Object.create(null), { bash: BASH_TOOL, create: 'Write', edit: 'Edit' }),
);

function normalizeToolName(rawName) {
  return COPILOT_TOOL_NAME_CASING[rawName] ?? rawName;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Copilot 1.0.63 sent toolArgs as a JSON-encoded string; 1.0.92 sends the object.
function parseToolArgs(toolArgs) {
  const parsed = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
  if (!isPlainObject(parsed)) {
    throw new Error('toolArgs did not decode to a plain JSON object');
  }
  return parsed;
}

// Copilot's tool schemas carry no `file_path` field anywhere — `path` is the
// field create/edit actually execute on. The bridge is UNCONDITIONAL: writing
// `file_path ?? path` would prefer an inspected decoy field over the executed
// one, letting an in-tree `file_path` mask an out-of-tree `path` and defeat
// containment. `path` always wins.
//
// A write tool (create/edit) whose args omit `path` altogether must not
// resolve silently to the working dir — `guardWritePath` in gate.js coerces
// a missing `file_path` to `''`, which resolves to the working dir itself and
// passes OPEN. Throwing here instead lets decideGuard's catch convert it to
// the documented fail-CLOSED `{ block: true }`.
function bridgeExecutedPath(parsedArgs, normalizedTool) {
  const { path } = parsedArgs;
  if (WRITE_TOOLS.has(normalizedTool) && !isNonEmptyString(path)) {
    throw new Error(`bridgeExecutedPath: write tool "${normalizedTool}" call carries no path`);
  }
  return { ...parsedArgs, file_path: path };
}

/**
 * Adapts a Copilot preToolUse payload to toolCallGuard's event shape.
 * Throws on a payload whose toolArgs is missing or not a plain JSON object, and on
 * a write-tool payload whose path is missing or empty (fail-closed).
 * @param {{ toolName: string, toolArgs: string|object, cwd: string }} payload
 * @returns {{ tool: string, tool_input: object, working_dir: string }}
 */
export function adaptCopilotEvent(payload) {
  const { toolName, toolArgs, cwd } = payload;
  const tool = normalizeToolName(toolName);
  return {
    tool,
    tool_input: bridgeExecutedPath(parseToolArgs(toolArgs), tool),
    working_dir: cwd,
  };
}

// A present, non-string command would be read char-by-char downstream and
// allowed; throwing lets decideGuard fail it closed.
function commandOf(toolInput) {
  const command = toolInput.command ?? '';
  if (typeof command !== 'string') {
    throw new TypeError('tool_input.command is not a string');
  }
  return command;
}

// toolCallGuard's containment branch blocks without a reason, so the model
// would only see the hook's generic fail-closed text.
function withContainmentReason(event, verdict) {
  if (verdict.block && verdict.reason === undefined && WRITE_TOOLS.has(event.tool)) {
    return { ...verdict, reason: CONTAINMENT_DENIED_REASON };
  }
  return verdict;
}

/**
 * Destructive git commands first, then the shared tool-call guard; the first
 * block wins.
 * @param {{ tool: string, tool_input: object, working_dir: string }} event
 * @returns {{ block: boolean, reason?: string }}
 */
export function copilotGuard(event) {
  if (event.tool === BASH_TOOL) {
    const destructive = gitDestructivePredicate(commandOf(event.tool_input));
    if (destructive.block) {
      return destructive;
    }
  }
  return withContainmentReason(event, toolCallGuard(event));
}

/**
 * Decides the guard verdict for a Copilot preToolUse payload. Never throws:
 * any structurally hostile payload (bad JSON, missing fields, a throwing
 * guard) fails CLOSED with a returned `{ block: true }` verdict.
 * @param {object} payload
 * @param {(event: object) => { block: boolean, reason?: string }} [guard]
 * @returns {{ block: boolean, reason?: string }}
 */
export function decideGuard(payload, guard = copilotGuard) {
  try {
    return guard(adaptCopilotEvent(payload));
  } catch (error) {
    return { block: true, reason: unreadableCallReason(error) };
  }
}

// A thrown value may be anything: reading its message must never throw.
function messageOf(error) {
  try {
    const { message } = error;
    return typeof message === 'string' && message !== '' ? message : UNKNOWN_ERROR;
  } catch {
    return UNKNOWN_ERROR;
  }
}

function unreadableCallReason(error) {
  return `craft: guard could not read the tool call (${messageOf(error)}) — denied fail-closed`;
}

// Documented fallback, not a swallowed error: a payload that fails to adapt
// is already denied by decideGuard with the failure as its reason, so the
// audit line only loses the path and returns `undefined` for it.
function resolveAuditPath(payload) {
  try {
    return adaptCopilotEvent(payload).tool_input.file_path;
  } catch {
    return undefined;
  }
}

/**
 * Builds the attributable audit record for a preToolUse verdict — toolName
 * and the resolved path alongside the block/reason verdict. Deliberately
 * excludes the raw tool arguments: file_text/old_str/new_str never reach the
 * log, so a blocked write's body is never dumped to stderr.
 * @param {object} payload
 * @param {{ block: boolean, reason?: string }} verdict
 * @returns {{ toolName: string|undefined, path: string|undefined, block: boolean, reason?: string }}
 */
export function buildAuditEntry(payload, verdict) {
  return {
    toolName: payload?.toolName,
    path: resolveAuditPath(payload),
    ...verdict,
  };
}
