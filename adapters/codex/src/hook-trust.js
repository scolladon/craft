/**
 * Pure transport framing for codex `app-server`'s `hooks/list` RPC and the
 * trust decision derived from its response.
 *
 * No I/O here: no `node:fs`, no `node:child_process`, no `process`. Spawning
 * and writing are the caller's job (a `src/` module the caller injects a
 * fake into during tests, and a real `node:child_process` import confined to
 * the bin that ships this transport).
 */

const JSONRPC_VERSION = '2.0';
const REQUEST_ID_INITIALIZE = 1;
const REQUEST_ID_HOOKS_LIST = 2;
const METHOD_INITIALIZE = 'initialize';
const METHOD_HOOKS_LIST = 'hooks/list';
const CLIENT_NAME = 'craft-hook-trust';
const CLIENT_VERSION = '0.1.0';

// The guard's location below the craft root, named once. The command match
// here and the on-disk existence check in the flow that consumes it are both
// derived from this, so a rename cannot leave one of them matching nothing.
export const GUARD_SCRIPT_SEGMENTS = Object.freeze(['adapters', 'codex', 'hooks', 'craft-guard.js']);

// codex runs a registered hook command through a shell, so `hooks/list` may
// echo it raw (carrying `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`) or expanded
// to an absolute path. The path tail is invariant under both, so matching on
// it (not a realpath) is the only comparison that survives either shape.
const GUARD_COMMAND_TAIL = `/${GUARD_SCRIPT_SEGMENTS.join('/')}`;

// The tail must be the OPERAND the interpreter executes, never merely a
// substring of the command: a shell string can carry it in a comment, a
// quoted argument or a flag value while executing something else entirely,
// and every one of those passes a containment test. The command is therefore
// required to be exactly an interpreter plus the guard operand — anything
// chained, wrapped or flagged is refused rather than trusted.
const GUARD_INTERPRETER = 'node';
const GUARD_COMMAND_TOKEN_COUNT = 2;
const PATH_SEPARATOR = '/';
const WHITESPACE_PATTERN = /\s+/;

// codex's own trust gate exists to stop a repository-supplied hook from
// executing, and `hooks/list` is asked about the craft checkout — so a hook
// this repository could have authored is never craft's own guard.
const REPOSITORY_HOOK_SOURCE = 'project';

const ENTRY_REQUIRED_KEYS = ['cwd', 'hooks', 'warnings', 'errors'];
const ENTRY_ARRAY_KEYS = ['hooks', 'warnings', 'errors'];

// The action a hook's trustStatus resolves to. A status outside this map is
// not a benign default — planTrust throws rather than guessing an action.
export const ACTION_WRITE = 'write';
export const ACTION_NOOP = 'noop';
const TRUST_STATUS_ACTIONS = Object.freeze({
  trusted: ACTION_NOOP,
  untrusted: ACTION_WRITE,
  modified: ACTION_WRITE,
  managed: ACTION_NOOP,
});

// The two fields a write persists verbatim. Only the write route needs them:
// an empty one would record an empty trusted_hash and still report success,
// and an absent one would surface as a bare TypeError from the TOML quoter
// rather than as a refusal.
const WRITE_REQUIRED_FIELDS = ['key', 'currentHash'];

function assertWritableFields(hook) {
  for (const field of WRITE_REQUIRED_FIELDS) {
    const value = hook[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`planTrust: ${field} must be a non-empty string to write trust, got ${JSON.stringify(value)}`);
    }
  }
}

function assertValidCwd(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new Error(`buildRequests: cwd must be a non-empty string, got ${JSON.stringify(cwd)}`);
  }
}

/**
 * Build the two newline-terminated JSON-RPC request lines codex's
 * `app-server` expects on stdin: `initialize` then `hooks/list`.
 *
 * @param {{ cwd: string }} params
 * @returns {string[]}
 */
export function buildRequests({ cwd }) {
  assertValidCwd(cwd);

  const initializeRequest = {
    jsonrpc: JSONRPC_VERSION,
    id: REQUEST_ID_INITIALIZE,
    method: METHOD_INITIALIZE,
    params: { clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION } },
  };
  const hooksListRequest = {
    jsonrpc: JSONRPC_VERSION,
    id: REQUEST_ID_HOOKS_LIST,
    method: METHOD_HOOKS_LIST,
    params: { cwds: [cwd] },
  };

  return [initializeRequest, hooksListRequest].map((request) => `${JSON.stringify(request)}\n`);
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    // A silently dropped unparsable line is exactly how a "0 hooks found"
    // false negative would look, so this must fail loud rather than skip.
    throw new Error(`parseHooksList: line is not valid JSON: ${line}`);
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// An id alone does not make a message an answer: the server issues requests of
// its own, numbered from its own counter, so an id collision is expected. Only
// a message carrying a result or an error and no method is a response.
function isResponse(message) {
  return isPlainObject(message) && !('method' in message) && ('result' in message || 'error' in message);
}

function findResponseById(messages, requestId) {
  const response = messages.find((message) => isResponse(message) && message.id === requestId);
  if (!response) {
    throw new Error(`parseHooksList: no response found for request id ${requestId}`);
  }
  return response;
}

/**
 * Render one `hooks/list` diagnostic — an error or a warning — as a line of
 * human-readable text. The protocol types them differently (errors are
 * `{message, path}` objects, warnings are strings), and neither is validated
 * before it is shown, so an unforeseen shape must still read as a diagnostic
 * rather than collapse to `[object Object]`.
 *
 * @param {unknown} entry
 * @returns {string}
 */
export function describeListingEntry(entry) {
  if (typeof entry === 'string') {
    return entry;
  }
  if (isPlainObject(entry) && typeof entry.message === 'string') {
    return typeof entry.path === 'string' ? `${entry.message} (${entry.path})` : entry.message;
  }
  return JSON.stringify(entry) ?? String(entry);
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} is not an object`);
  }
}

function assertValidEntry(entry) {
  assertPlainObject(entry, 'parseHooksList: result.data[0]');
  const keys = Object.keys(entry);

  for (const required of ENTRY_REQUIRED_KEYS) {
    if (!(required in entry)) {
      throw new Error(`parseHooksList: result.data[0] is missing "${required}" (keys: ${keys.join(', ')})`);
    }
  }
  for (const arrayKey of ENTRY_ARRAY_KEYS) {
    if (!Array.isArray(entry[arrayKey])) {
      throw new Error(`parseHooksList: result.data[0].${arrayKey} is not an array (keys: ${keys.join(', ')})`);
    }
  }
}

/**
 * Parse an `app-server` stdout capture and extract the `hooks/list` result
 * for the given request id. Selection is by id, never by stream position:
 * notifications and the `initialize` response interleave freely and may
 * arrive in either order relative to the `hooks/list` response.
 *
 * @param {string} stdoutText
 * @param {{ requestId: number }} params
 * @returns {{ hooks: unknown[], warnings: unknown[], errors: unknown[] }}
 */
export function parseHooksList(stdoutText, { requestId }) {
  const lines = stdoutText.split('\n').filter((line) => line.trim().length > 0);
  const messages = lines.map(parseLine);
  const response = findResponseById(messages, requestId);

  if (response.error) {
    throw new Error(`parseHooksList: server returned an error: ${describeListingEntry(response.error)}`);
  }

  assertPlainObject(response.result, 'parseHooksList: response.result');
  const { result } = response;
  if (!Array.isArray(result.data)) {
    throw new Error(`parseHooksList: result.data is missing or not an array (keys: ${Object.keys(result).join(', ')})`);
  }
  if (result.data.length !== 1) {
    throw new Error(`parseHooksList: expected exactly one result.data entry, got ${result.data.length}`);
  }

  const [entry] = result.data;
  assertValidEntry(entry);

  return { hooks: entry.hooks, warnings: entry.warnings, errors: entry.errors };
}

function describeErrors(errors) {
  return errors.map(describeListingEntry).join('; ');
}

function assertSingleMatch(matches, errors) {
  if (matches.length > 0) {
    return;
  }
  if (errors.length > 0) {
    throw new Error(`selectCraftHook: no craft hook found and codex reported config errors: ${describeErrors(errors)}`);
  }
  throw new Error('selectCraftHook: no craft hook found — no registered command runs the craft guard as its operand');
}

function toBasename(token) {
  return token.slice(token.lastIndexOf(PATH_SEPARATOR) + 1);
}

function isGuardHook(hook) {
  const command = isPlainObject(hook) ? hook.command : undefined;
  if (typeof command !== 'string') {
    return false;
  }
  const tokens = command.trim().split(WHITESPACE_PATTERN);
  if (tokens.length !== GUARD_COMMAND_TOKEN_COUNT) {
    return false;
  }
  const [interpreter, operand] = tokens;
  return toBasename(interpreter) === GUARD_INTERPRETER && operand.endsWith(GUARD_COMMAND_TAIL);
}

function assertNotRepositorySourced(hook) {
  if (hook.source === REPOSITORY_HOOK_SOURCE) {
    throw new Error(
      `selectCraftHook: the matched hook is ${REPOSITORY_HOOK_SOURCE}-sourced (${hook.sourcePath}), and a repository-supplied hook is never trusted`
    );
  }
}

/**
 * Select the single hook registration whose `command` is craft's guard,
 * matched on the path tail rather than a realpath because `hooks/list` may
 * echo the command raw or shell-expanded.
 *
 * @param {Array<{ command: string, sourcePath: string, source: string }>} hooks
 * @param {{ errors?: Array<{ message: string, path: string }> }} [params]
 * @returns {object}
 */
export function selectCraftHook(hooks, { errors = [] } = {}) {
  const matches = hooks.filter(isGuardHook);

  assertSingleMatch(matches, errors);
  if (matches.length > 1) {
    const sourcePaths = matches.map((hook) => hook.sourcePath).join(', ');
    throw new Error(`selectCraftHook: multiple craft hooks matched (${matches.length}): ${sourcePaths}`);
  }

  assertNotRepositorySourced(matches[0]);
  return matches[0];
}

/**
 * Derive the trust action for a hook. Pure: no I/O, no write — the caller
 * executes the returned intent. `from` is the observed trustStatus, not a
 * previous hash, because `hooks/list` never reports one.
 *
 * @param {{ key: string, currentHash: string, trustStatus: string, enabled: boolean }} hook
 * @returns {{ action: 'write' | 'noop', key: string, hash: string, from: string, enabled: boolean }}
 */
export function planTrust(hook) {
  if (!Object.hasOwn(TRUST_STATUS_ACTIONS, hook.trustStatus)) {
    throw new Error(`planTrust: unknown trustStatus "${hook.trustStatus}"`);
  }

  const action = TRUST_STATUS_ACTIONS[hook.trustStatus];
  if (action === ACTION_WRITE) {
    assertWritableFields(hook);
  }

  return {
    action,
    key: hook.key,
    hash: hook.currentHash,
    from: hook.trustStatus,
    enabled: hook.enabled,
  };
}
