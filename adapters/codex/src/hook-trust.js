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

// codex runs a registered hook command through a shell, so `hooks/list` may
// echo it raw (carrying `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`) or expanded
// to an absolute path. The path tail is invariant under both, so matching on
// it (not a realpath) is the only comparison that survives either shape.
const GUARD_COMMAND_TAIL = '/adapters/codex/hooks/craft-guard.js';

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
const TRUST_STATUS_ACTIONS = Object.freeze({
  trusted: 'noop',
  untrusted: 'write',
  modified: 'write',
  managed: 'noop',
});

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

function findResponseById(messages, requestId) {
  const response = messages.find((message) => message && typeof message === 'object' && message.id === requestId);
  if (!response) {
    throw new Error(`parseHooksList: no response found for request id ${requestId}`);
  }
  return response;
}

function assertPlainObject(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
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
    throw new Error(`parseHooksList: server returned an error: ${response.error.message}`);
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
  return errors.map(({ message, path }) => `${message} (${path})`).join('; ');
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

function isGuardCommand(command) {
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
  const matches = hooks.filter((hook) => isGuardCommand(hook.command));

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

  return {
    action: TRUST_STATUS_ACTIONS[hook.trustStatus],
    key: hook.key,
    hash: hook.currentHash,
    from: hook.trustStatus,
    enabled: hook.enabled,
  };
}
