/**
 * PreToolUse event adapter for the Codex binding: reshapes a Codex PreToolUse
 * HOOK PAYLOAD (`tool_name` / `tool_input`) into the event shape
 * `engine/src/guards/tool-call-guard.js`'s toolCallGuard expects, then applies
 * that predicate unmodified. Keys off the hook payload, never a request-body
 * tool list — the tool surface varies by model (an unknown model id can drop
 * `apply_patch` entirely, and `gpt-5.6-sol` sends no `tools` key at all), so
 * the hook payload is the only surface present across every model case.
 *
 * Unlike copilot's observer, this verdict is genuinely enforcing: the hook in
 * `adapters/codex/hooks/craft-guard.js` turns a `{ block: true }` verdict here
 * into a real exit-code-2 denial that stops the call.
 */
import { toolCallGuard, WRITE_TOOLS } from '../../../engine/src/guards/tool-call-guard.js';
import { extractPatchPaths } from './apply-patch-paths.js';

const BASH_TOOL_NAME = 'Bash';

// Only the tool names the shared predicate branches on get an entry — every
// other Codex tool (write_stdin, update_plan, view_image, web_search,
// tool_search, request_user_input, the multi_agent_v1 verbs, the goal verbs)
// passes through unchanged and hits the predicate's { block: false } tail.
// Null-prototype and frozen so a tool named "constructor" or "__proto__"
// falls through to the raw name instead of resolving an inherited member
// (the same own-property discipline as model-tier-map.js).
const CODEX_TOOL_NAMES = Object.freeze(
  Object.assign(Object.create(null), { exec_command: 'Bash', apply_patch: 'Write' }),
);

const PATCH_TEXT_CANDIDATE_FIELDS = Object.freeze(['input', 'patch', 'text']);

function normalizeToolName(rawName) {
  return CODEX_TOOL_NAMES[rawName] ?? rawName;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// guardWritePath coerces a missing working dir into resolve('') =
// process.cwd(), which would silently contain paths against the wrong root.
// An absent/empty cwd is a malformed payload here, not a benign default.
function requireWorkingDir(cwd) {
  if (!isNonEmptyString(cwd)) {
    // equivalent mutant (StringLiteral ""): decideGuard's bare catch discards
    // the error, so no message text is reachable from any caller.
    throw new Error('adaptCodexEvent: payload carries no working directory (cwd)');
  }
  return cwd;
}

// exec_command carries `cmd` as a STRING — Codex itself rejects an argv array
// ("invalid type: sequence, expected a string"). The bridge to `command`, the
// field toolCallGuard reads, is UNCONDITIONAL: `command ?? cmd` would let an
// inspected decoy `command` mask the `cmd` the tool actually executes. A
// missing or non-string `cmd` is a malformed payload, not an alternate
// encoding, so it throws here and decideGuard's catch converts that into the
// documented fail-closed verdict.
function bridgeExecutedCommand(toolInput) {
  // equivalent mutant (OptionalChaining): a nullish toolInput throws TypeError
  // without the `?.` instead of the Error below — both reach the same bare
  // catch and the same { block: true }.
  const cmd = toolInput?.cmd;
  if (!isNonEmptyString(cmd)) {
    // equivalent mutant (StringLiteral ""): message is discarded, see decideGuard.
    throw new Error('bridgeExecutedCommand: exec_command call carries no string cmd');
  }
  return { ...toolInput, command: cmd };
}

// apply_patch has no structured path field: the payload IS raw patch text,
// but the field name carrying it is UNPINNED. Resolve it defensively across
// every candidate shape, in this order, taking the first non-empty string
// found. A shape this resolution does not recognise must never be treated as
// "no patch to check" — it throws, and decideGuard's catch turns that into
// the documented fail-closed verdict.
function resolvePatchText(toolInput) {
  if (isNonEmptyString(toolInput)) {
    return toolInput;
  }

  // equivalent mutants (ConditionalExpression true, LogicalOperator ||): this
  // guard only spares a TypeError. A null toolInput indexed anyway throws; a
  // non-object primitive yields undefined for every candidate key and falls to
  // the throw below. Every route ends at { block: true }.
  if (toolInput !== null && typeof toolInput === 'object') {
    const field = PATCH_TEXT_CANDIDATE_FIELDS.find((key) => isNonEmptyString(toolInput[key]));
    // equivalent mutant (ConditionalExpression true): an undefined field indexes
    // to undefined patchText, which extracts zero paths and fails closed — the
    // same verdict the throw below produces.
    if (field !== undefined) {
      return toolInput[field];
    }
  }

  // equivalent mutant (StringLiteral ""): message is discarded, see decideGuard.
  throw new Error('resolvePatchText: apply_patch call carries no recognisable patch text field');
}

function bridgeToolInput(tool, toolInput) {
  if (tool === BASH_TOOL_NAME) {
    return bridgeExecutedCommand(toolInput);
  }
  if (WRITE_TOOLS.has(tool)) {
    return { patchText: resolvePatchText(toolInput) };
  }
  return toolInput;
}

/**
 * Adapts a Codex PreToolUse hook payload to toolCallGuard's event shape.
 * Throws on a payload missing `cwd`, on an exec_command call whose `cmd` is
 * not a non-empty string, and on an apply_patch call whose patch text cannot
 * be found in any recognised field.
 * @param {{ tool_name: string, tool_input: object|string, cwd: string }} payload
 * @returns {{ tool: string, tool_input: object, working_dir: string }}
 */
export function adaptCodexEvent(payload) {
  const { tool_name, tool_input, cwd } = payload ?? {};
  const working_dir = requireWorkingDir(cwd);
  const tool = normalizeToolName(tool_name);
  return { tool, tool_input: bridgeToolInput(tool, tool_input), working_dir };
}

// toolCallGuard checks ONE file_path per call; apply_patch may name many, so
// the predicate runs once per path extracted from the patch text and the
// FIRST blocking verdict wins. Zero extracted paths from a non-empty patch,
// and a directive whose path is the empty string, must never read as
// "nothing to contain" — both fail closed here rather than falling through
// to guardWritePath, which would resolve an empty path to the working dir
// root and pass it.
function decideWriteContainment({ tool, tool_input, working_dir }, guard) {
  const paths = extractPatchPaths(tool_input.patchText);
  if (paths.length === 0) {
    return { block: true };
  }

  for (const path of paths) {
    if (path === '') {
      return { block: true };
    }
    const verdict = guard({ tool, tool_input: { file_path: path }, working_dir });
    if (verdict.block) {
      return verdict;
    }
  }

  return { block: false };
}

/**
 * Decides the enforcement verdict for a Codex PreToolUse payload. Never
 * throws: any structurally hostile payload (missing cwd, a malformed
 * exec_command or apply_patch shape, a throwing guard) fails CLOSED with a
 * returned `{ block: true }` verdict.
 * @param {object} payload
 * @param {(event: object) => { block: boolean, reason?: string }} [guard]
 * @returns {{ block: boolean, reason?: string }}
 */
export function decideGuard(payload, guard = toolCallGuard) {
  try {
    const event = adaptCodexEvent(payload);
    return WRITE_TOOLS.has(event.tool) ? decideWriteContainment(event, guard) : guard(event);
  } catch {
    // This bare catch collapses every rejection path onto one indistinguishable
    // verdict, which is why the throw-site message and shape-check mutants below
    // are equivalent: no caller can observe WHICH malformed shape fired, only
    // that the payload failed closed.
    return { block: true };
  }
}
