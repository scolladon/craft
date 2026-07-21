/**
 * preToolUse event adapter for the Copilot binding: reshapes Copilot's lowercase,
 * string-encoded event into the shape `gate.js`'s toolCallGuard expects, then
 * applies that predicate unmodified. This layer is observational (see
 * hooks/craft-observer.js) — it never enforces, it only decides a verdict to record.
 */
import { toolCallGuard, WRITE_TOOLS } from '../../../engine/src/guards/tool-call-guard.js';

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
  Object.assign(Object.create(null), { bash: 'Bash', create: 'Write', edit: 'Edit' }),
);

function normalizeToolName(rawName) {
  return COPILOT_TOOL_NAME_CASING[rawName] ?? rawName;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function parseToolArgs(toolArgs) {
  const parsed = JSON.parse(toolArgs);
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('toolArgs did not decode to a JSON object');
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
 * Throws on a payload whose toolArgs is missing or not a JSON object, and on
 * a write-tool payload whose path is missing or empty (fail-closed).
 * @param {{ toolName: string, toolArgs: string, cwd: string }} payload
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

/**
 * Decides the audit verdict for a Copilot preToolUse payload. Never throws:
 * any structurally hostile payload (bad JSON, missing fields, a throwing
 * guard) fails CLOSED with a returned `{ block: true }` verdict.
 * @param {object} payload
 * @param {(event: object) => { block: boolean, reason?: string }} [guard]
 * @returns {{ block: boolean, reason?: string }}
 */
export function decideGuard(payload, guard = toolCallGuard) {
  try {
    return guard(adaptCopilotEvent(payload));
  } catch {
    return { block: true };
  }
}

// Never throws: a payload that fails to adapt (malformed toolArgs, missing
// path) still needs its verdict attributed, so path resolution here swallows
// the throw rather than losing the audit line entirely.
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
