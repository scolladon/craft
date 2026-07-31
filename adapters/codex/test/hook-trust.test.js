import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequests, parseHooksList, selectCraftHook, planTrust } from '../src/hook-trust.js';

const CWD = '/fixture/repo';
const CODEX_HOME_KEY = '/fixture/codex-home/config.toml:pre_tool_use:0:0';
const CURRENT_HASH = 'sha256:031fe4e9d67c31089132dd774df39307c554f5cf27089031a68c75233ef2ecf4';
const RAW_COMMAND = 'node ${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/adapters/codex/hooks/craft-guard.js';
const EXPANDED_COMMAND = 'node /fixture/repo/adapters/codex/hooks/craft-guard.js';
const FOREIGN_COMMAND = 'node /fixture/repo/other/hooks/something.js';

function craftHook(overrides = {}) {
  return {
    key: CODEX_HOME_KEY,
    currentHash: CURRENT_HASH,
    trustStatus: 'untrusted',
    enabled: true,
    source: 'user',
    sourcePath: '/fixture/codex-home/config.toml',
    handlerType: 'command',
    matcher: 'pre_tool_use',
    timeoutSec: 30,
    isManaged: false,
    command: RAW_COMMAND,
    ...overrides,
  };
}

function foreignHook(overrides = {}) {
  return craftHook({
    command: FOREIGN_COMMAND,
    sourcePath: '/fixture/repo/other/hooks/something.js',
    ...overrides,
  });
}

function envelopeLine({ hooks = [craftHook()], warnings = [], errors = [], cwd = CWD, requestId = 2 } = {}) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: requestId,
    result: { data: [{ cwd, hooks, warnings, errors }] },
  });
}

function initializeResponseLine() {
  return JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '1' } });
}

function notificationLine() {
  return JSON.stringify({ jsonrpc: '2.0', method: 'codex/event', params: {} });
}

describe('buildRequests()', () => {
  it('Given a repo root cwd, when buildRequests runs, then it emits the initialize line then the hooks/list line, each newline-terminated, with ids 1 and 2 and params.cwds equal to the cwd', () => {
    const sut = buildRequests;

    const result = sut({ cwd: CWD });

    assert.equal(result.length, 2);
    assert.ok(result[0].endsWith('\n'));
    assert.ok(result[1].endsWith('\n'));
    const first = JSON.parse(result[0]);
    const second = JSON.parse(result[1]);
    assert.equal(first.id, 1);
    assert.equal(first.method, 'initialize');
    assert.equal(second.id, 2);
    assert.equal(second.method, 'hooks/list');
    assert.deepEqual(second.params.cwds, [CWD]);
  });

  it('Given a missing cwd, when buildRequests runs, then it throws', () => {
    const sut = buildRequests;

    assert.throws(() => sut({}));
  });
});

describe('parseHooksList()', () => {
  it('Given a stream with notifications interleaved around the id-2 response, when parseHooksList runs, then it returns hooks, warnings and errors from result.data[0]', () => {
    const sut = parseHooksList;
    const errors = [];
    const warnings = [];
    const hooks = [craftHook()];
    const stream = [
      notificationLine(),
      initializeResponseLine(),
      notificationLine(),
      envelopeLine({ hooks, warnings, errors }),
    ].join('\n');

    const result = sut(stream, { requestId: 2 });

    assert.deepEqual(result.hooks, hooks);
    assert.deepEqual(result.warnings, warnings);
    assert.deepEqual(result.errors, errors);
  });

  it('Given a stream where the id-2 response arrives before the id-1 response, when parseHooksList runs, then it still selects by id and returns the hooks', () => {
    const sut = parseHooksList;
    const hooks = [craftHook()];
    const stream = [notificationLine(), envelopeLine({ hooks }), initializeResponseLine()].join('\n');

    const result = sut(stream, { requestId: 2 });

    assert.deepEqual(result.hooks, hooks);
  });

  it('Given a matched response carrying a JSON-RPC error member, when parseHooksList runs, then it throws with the server error message', () => {
    const sut = parseHooksList;
    const stream = JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'boom from server' } });

    assert.throws(() => sut(stream, { requestId: 2 }), /boom from server/);
  });

  it('Given a stream carrying a line that is not valid JSON, when parseHooksList runs, then it throws', () => {
    const sut = parseHooksList;
    const stream = ['not-json-at-all', envelopeLine()].join('\n');

    assert.throws(() => sut(stream, { requestId: 2 }));
  });

  it('Given a stream with no response carrying the requested id, when parseHooksList runs, then it throws', () => {
    const sut = parseHooksList;
    const stream = [initializeResponseLine(), notificationLine()].join('\n');

    assert.throws(() => sut(stream, { requestId: 2 }));
  });

  it('Given a matched response whose result has no data key, when parseHooksList runs, then it throws naming the observed keys', () => {
    const sut = parseHooksList;
    const stream = JSON.stringify({ jsonrpc: '2.0', id: 2, result: { unexpectedKey: true } });

    assert.throws(() => sut(stream, { requestId: 2 }), /unexpectedKey/);
  });

  it('Given a matched response whose result.data has two entries, when parseHooksList runs, then it throws naming the observed length', () => {
    const sut = parseHooksList;
    const entry = { cwd: CWD, hooks: [], warnings: [], errors: [] };
    const stream = JSON.stringify({ jsonrpc: '2.0', id: 2, result: { data: [entry, entry] } });

    assert.throws(() => sut(stream, { requestId: 2 }), /2/);
  });

  it('Given a matched response whose data[0] entry is missing errors, when parseHooksList runs, then it throws', () => {
    const sut = parseHooksList;
    const entry = { cwd: CWD, hooks: [], warnings: [] };
    const stream = JSON.stringify({ jsonrpc: '2.0', id: 2, result: { data: [entry] } });

    assert.throws(() => sut(stream, { requestId: 2 }));
  });
});

describe('selectCraftHook()', () => {
  it('Given a single hook whose command carries the raw unexpanded guard path, when selectCraftHook runs, then it returns that hook', () => {
    const sut = selectCraftHook;
    const hook = craftHook({ command: RAW_COMMAND });

    const result = sut([hook]);

    assert.equal(result, hook);
  });

  it('Given a single hook whose command carries the shell-expanded absolute guard path, when selectCraftHook runs, then it returns that hook', () => {
    const sut = selectCraftHook;
    const hook = craftHook({ command: EXPANDED_COMMAND });

    const result = sut([hook]);

    assert.equal(result, hook);
  });

  it('Given zero matches and an empty errors list, when selectCraftHook runs, then it throws the plain no-match message', () => {
    const sut = selectCraftHook;
    const hooks = [foreignHook()];

    assert.throws(() => sut(hooks, { errors: [] }), (err) => {
      assert.ok(!/config error/i.test(err.message));
      return true;
    });
  });

  it('Given zero matches and a non-empty errors list, when selectCraftHook runs, then it throws quoting each error message and path', () => {
    const sut = selectCraftHook;
    const hooks = [foreignHook()];
    const errors = [{ message: 'failed to load hook config', path: '/fixture/codex-home/config.toml' }];

    assert.throws(() => sut(hooks, { errors }), /failed to load hook config/);
    assert.throws(() => sut(hooks, { errors }), /\/fixture\/codex-home\/config\.toml/);
  });

  it('Given two matching hooks, when selectCraftHook runs, then it throws naming both sourcePaths', () => {
    const sut = selectCraftHook;
    const first = craftHook({ command: RAW_COMMAND, sourcePath: '/fixture/codex-home/config.toml' });
    const second = craftHook({ command: EXPANDED_COMMAND, sourcePath: '/fixture/repo/.codex/config.toml' });

    assert.throws(() => sut([first, second]), /\/fixture\/codex-home\/config\.toml/);
    assert.throws(() => sut([first, second]), /\/fixture\/repo\/\.codex\/config\.toml/);
  });
});

describe('planTrust()', () => {
  const cases = [
    ['trusted', 'noop'],
    ['untrusted', 'write'],
    ['modified', 'write'],
    ['managed', 'noop'],
  ];

  for (const [trustStatus, expectedAction] of cases) {
    it(`Given a hook whose trustStatus is "${trustStatus}", when planTrust runs, then the action is "${expectedAction}" and key/hash/from/enabled are carried through`, () => {
      const sut = planTrust;
      const hook = craftHook({ trustStatus, enabled: false });

      const result = sut(hook);

      assert.equal(result.action, expectedAction);
      assert.equal(result.key, hook.key);
      assert.equal(result.hash, hook.currentHash);
      assert.equal(result.from, trustStatus);
      assert.equal(result.enabled, false);
    });
  }

  it('Given a hook whose trustStatus is unrecognised, when planTrust runs, then it throws', () => {
    const sut = planTrust;
    const hook = craftHook({ trustStatus: 'quarantined' });

    assert.throws(() => sut(hook));
  });
});
