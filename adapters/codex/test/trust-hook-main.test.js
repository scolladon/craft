import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { main, EXIT_OK, EXIT_UNTRUSTED, EXIT_REFUSED } from '../src/trust-hook-main.js';
import { toQuotedTomlKey } from '../src/config-toml-trust.js';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT_STUB = '/fixture/repo';
const CODEX_HOME_STUB = '/fixture/codex-home';
const GUARD_SCRIPT_PATH = join(REPO_ROOT_STUB, 'adapters', 'codex', 'hooks', 'craft-guard.js');
const CURRENT_HASH = 'sha256:031fe4e9d67c31089132dd774df39307c554f5cf27089031a68c75233ef2ecf4';
const OLD_HASH = 'sha256:oldoldoldoldoldoldoldoldoldoldoldoldoldoldoldoldoldoldoldoldold';
const HOOK_KEY = `${CODEX_HOME_STUB}/config.toml:pre_tool_use:0:0`;
const GUARD_COMMAND = `node ${GUARD_SCRIPT_PATH}`;
const DEFAULT_ENV = { CODEX_HOME: CODEX_HOME_STUB, HOME: undefined };
const FORBIDDEN_FLAG = '--dangerously-bypass-hook-trust';
const FORBIDDEN_KEY = 'bypass_hook_trust';

function craftHook(overrides = {}) {
  return {
    key: HOOK_KEY,
    currentHash: CURRENT_HASH,
    trustStatus: 'untrusted',
    enabled: true,
    source: 'user',
    sourcePath: `${CODEX_HOME_STUB}/config.toml`,
    handlerType: 'command',
    matcher: 'pre_tool_use',
    timeoutSec: 30,
    isManaged: false,
    command: GUARD_COMMAND,
    ...overrides,
  };
}

function hooksListEnvelope({ hooks = [craftHook()], warnings = [], errors = [], requestId = 2 } = {}) {
  return `${JSON.stringify({
    jsonrpc: '2.0',
    id: requestId,
    result: { data: [{ cwd: REPO_ROOT_STUB, hooks, warnings, errors }] },
  })}\n`;
}

function createStreamCollector() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(chunk);
    },
    text() {
      return chunks.join('');
    },
  };
}

function createDeps({
  hooks = [craftHook()],
  warnings = [],
  errors = [],
  readConfig = () => '',
  guardScriptExists,
  env = DEFAULT_ENV,
  runAppServer,
} = {}) {
  const writeCalls = [];
  const runAppServerCalls = [];
  const guardScriptExistsCalls = [];
  const stdout = createStreamCollector();
  const stderr = createStreamCollector();

  const trackedGuardScriptExists = (path) => {
    guardScriptExistsCalls.push(path);
    return guardScriptExists ? guardScriptExists(path) : true;
  };
  const defaultRunAppServer = async (params) => {
    runAppServerCalls.push(params);
    return hooksListEnvelope({ hooks, warnings, errors });
  };

  const deps = {
    runAppServer: runAppServer
      ? async (params) => {
          runAppServerCalls.push(params);
          return runAppServer(params);
        }
      : defaultRunAppServer,
    readConfig,
    writeConfig: (path, text) => writeCalls.push({ path, text }),
    guardScriptExists: trackedGuardScriptExists,
    resolveRoot: () => REPO_ROOT_STUB,
    env,
    stdout,
    stderr,
  };

  return { deps, writeCalls, runAppServerCalls, guardScriptExistsCalls, stdout, stderr };
}

function countOutputLines(stream) {
  return stream.text().split('\n').filter((line) => line.length > 0).length;
}

function assertSingleStderrLine(stderr) {
  const lines = stderr.text().split('\n').filter((line) => line.length > 0);
  assert.equal(lines.length, 1);
  return lines[0];
}

function assertRefused({ result, writeCalls, stderr }) {
  assert.equal(result, EXIT_REFUSED);
  assert.equal(writeCalls.length, 0);
  return assertSingleStderrLine(stderr);
}

// Same refusal contract, but for the paths that legitimately emit listing
// diagnostics alongside the refusal, so the line count is not fixed at one.
function assertRefusedWithDiagnostics({ result, writeCalls, stderr }) {
  assert.equal(result, EXIT_REFUSED);
  assert.equal(writeCalls.length, 0);
  return stderr.text();
}

describe('main() — write mode', () => {
  it('Given an untrusted craft hook and an empty config, when main runs, then it calls writeConfig exactly once with the upserted text and returns 0', async () => {
    const { deps, writeCalls } = createDeps({ hooks: [craftHook({ trustStatus: 'untrusted' })] });
    const sut = main;

    const result = await sut([], deps);

    assert.equal(result, EXIT_OK);
    assert.equal(writeCalls.length, 1);
    assert.ok(writeCalls[0].text.includes(toQuotedTomlKey(HOOK_KEY)));
    assert.ok(writeCalls[0].text.includes(CURRENT_HASH));
  });

  it('Given an already-trusted hook, when main runs, then writeConfig is never called and it returns 0', async () => {
    const { deps, writeCalls } = createDeps({ hooks: [craftHook({ trustStatus: 'trusted' })] });
    const sut = main;

    const result = await sut([], deps);

    assert.equal(result, EXIT_OK);
    assert.equal(writeCalls.length, 0);
  });

  it('Given a managed hook, when main runs, then writeConfig is never called and it returns 0', async () => {
    const { deps, writeCalls } = createDeps({ hooks: [craftHook({ trustStatus: 'managed' })] });
    const sut = main;

    const result = await sut([], deps);

    assert.equal(result, EXIT_OK);
    assert.equal(writeCalls.length, 0);
  });

  it('Given a modified hook and a config already carrying the table with an older hash, when main runs, then writeConfig is called once and the written text carries exactly one occurrence of the table header', async () => {
    const headerLine = `[hooks.state.${toQuotedTomlKey(HOOK_KEY)}]`;
    const existingConfig = `${headerLine}\ntrusted_hash = "${OLD_HASH}"\n`;
    const { deps, writeCalls } = createDeps({
      hooks: [craftHook({ trustStatus: 'modified' })],
      readConfig: () => existingConfig,
    });
    const sut = main;

    const result = await sut([], deps);

    assert.equal(result, EXIT_OK);
    assert.equal(writeCalls.length, 1);
    const occurrences = writeCalls[0].text.split(headerLine).length - 1;
    assert.equal(occurrences, 1);
    assert.ok(writeCalls[0].text.includes(CURRENT_HASH));
  });
});

describe('main() — refusal matrix', () => {
  it('Given both CODEX_HOME and HOME unset, when main runs, then it refuses before any I/O and writes a single stderr line', async () => {
    const { deps, writeCalls, runAppServerCalls, guardScriptExistsCalls, stderr } = createDeps({ env: {} });
    const sut = main;

    const result = await sut([], deps);

    assertRefused({ result, writeCalls, stderr });
    assert.equal(runAppServerCalls.length, 0);
    assert.equal(guardScriptExistsCalls.length, 0);
  });

  it('Given a missing guard script, when main runs, then it refuses naming the guard path under adapters/codex/hooks and never calls runAppServer', async () => {
    const { deps, writeCalls, runAppServerCalls, guardScriptExistsCalls, stderr } = createDeps({
      guardScriptExists: () => false,
    });
    const sut = main;

    const result = await sut([], deps);

    const line = assertRefused({ result, writeCalls, stderr });
    assert.ok(line.includes(GUARD_SCRIPT_PATH));
    assert.equal(runAppServerCalls.length, 0);
    assert.deepEqual(guardScriptExistsCalls, [GUARD_SCRIPT_PATH]);
  });

  it('Given a hook list with zero craft matches and an empty errors list, when main runs, then it refuses', async () => {
    const { deps, writeCalls, stderr } = createDeps({ hooks: [] });
    const sut = main;

    const result = await sut([], deps);

    assertRefused({ result, writeCalls, stderr });
  });

  it('Given a hook list with two craft matches, when main runs, then it refuses', async () => {
    const { deps, writeCalls, stderr } = createDeps({
      hooks: [craftHook({ sourcePath: '/fixture/codex-home/config.toml' }), craftHook({ sourcePath: '/fixture/repo/.codex/config.toml' })],
    });
    const sut = main;

    const result = await sut([], deps);

    assertRefused({ result, writeCalls, stderr });
  });

  it('Given a matched hook with enabled false, when main runs, then it refuses naming the hook as disabled', async () => {
    const { deps, writeCalls, stderr } = createDeps({ hooks: [craftHook({ enabled: false })] });
    const sut = main;

    const result = await sut([], deps);

    const line = assertRefused({ result, writeCalls, stderr });
    assert.match(line, /disabled/i);
  });

  // Only `enabled === true` is a registration codex will actually run, so an
  // absent or non-boolean field is a listing this flow cannot reason about —
  // never a hook to trust by default.
  const NOT_ENABLED = [
    ['absent', undefined],
    ['null', null],
    ['the number zero', 0],
    ['the string "false"', 'false'],
    ['the string "true"', 'true'],
  ];

  for (const [label, enabled] of NOT_ENABLED) {
    it(`Given a matched hook whose enabled field is ${label}, when main runs, then it refuses without writing`, async () => {
      const { deps, writeCalls, stderr } = createDeps({ hooks: [craftHook({ enabled })] });
      const sut = main;

      const result = await sut([], deps);

      const line = assertRefused({ result, writeCalls, stderr });
      assert.match(line, /not a boolean|missing/i);
    });
  }

  it('Given a runAppServer that rejects with a timeout error, when main runs, then the stderr line names the timeout', async () => {
    const { deps, writeCalls, stderr } = createDeps({
      runAppServer: async () => {
        throw new Error('app-server timed out after 5ms waiting for response id 2');
      },
    });
    const sut = main;

    const result = await sut([], deps);

    const line = assertRefused({ result, writeCalls, stderr });
    assert.match(line, /timed out/i);
  });

  it('Given a stream carrying a JSON-RPC error member, when main runs, then it refuses naming the server error', async () => {
    const errorLine = `${JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'boom from server' } })}\n`;
    const { deps, writeCalls, stderr } = createDeps({ runAppServer: async () => errorLine });
    const sut = main;

    const result = await sut([], deps);

    const line = assertRefused({ result, writeCalls, stderr });
    assert.match(line, /boom from server/);
  });

  it('Given an unrecognised argv entry, when main runs, then it refuses without ever calling runAppServer', async () => {
    const { deps, writeCalls, runAppServerCalls, stderr } = createDeps();
    const sut = main;

    const result = await sut(['--chek'], deps);

    assertRefused({ result, writeCalls, stderr });
    assert.equal(runAppServerCalls.length, 0);
  });
});

describe('main() — listing diagnostics', () => {
  it('Given a response with zero craft matches and a non-empty errors list, when main runs, then it refuses quoting each error message and path', async () => {
    const errors = [{ message: 'failed to load hook config', path: '/fixture/codex-home/config.toml' }];
    const { deps, writeCalls, stderr } = createDeps({ hooks: [], errors });
    const sut = main;

    const result = await sut([], deps);

    const text = assertRefusedWithDiagnostics({ result, writeCalls, stderr });
    assert.match(text, /failed to load hook config/);
    assert.match(text, /\/fixture\/codex-home\/config\.toml/);
  });

  it('Given a response carrying warnings, when main runs, then every warning is reported on stdout and the run completes normally', async () => {
    const warnings = ['codex reported something benign about the hook config'];
    const { deps, stdout } = createDeps({ hooks: [craftHook({ trustStatus: 'trusted' })], warnings });
    const sut = main;

    const result = await sut([], deps);

    assert.equal(result, EXIT_OK);
    assert.ok(stdout.text().includes(warnings[0]));
  });

  it('Given a matched hook and a non-empty errors list, when main runs, then the errors reach stderr even though a hook was found', async () => {
    const errors = [{ message: 'failed to load hook config', path: '/fixture/other/config.toml' }];
    const { deps, stderr } = createDeps({ hooks: [craftHook({ trustStatus: 'trusted' })], errors });
    const sut = main;

    await sut([], deps);

    assert.match(stderr.text(), /failed to load hook config/);
  });

  it('Given an untrusted matched hook and a non-empty errors list, when main runs, then it refuses to write because the listing it arbitrated on is incomplete', async () => {
    const errors = [{ message: 'failed to load hook config', path: '/fixture/other/config.toml' }];
    const { deps, writeCalls, stderr } = createDeps({ hooks: [craftHook({ trustStatus: 'untrusted' })], errors });
    const sut = main;

    const result = await sut([], deps);

    const text = assertRefusedWithDiagnostics({ result, writeCalls, stderr });
    assert.match(text, /incomplete/i);
  });
});

describe('main() — server-supplied text never forges a line', () => {
  const FORGED_TAIL = '\ntrust-hook: trusted key=forged from=untrusted hash=forged';

  it('Given a matched hook whose sourcePath carries a line feed, when main runs, then the announcement stays on one line', async () => {
    const { deps, stdout } = createDeps({
      hooks: [craftHook({ trustStatus: 'trusted', sourcePath: `${CODEX_HOME_STUB}/config.toml${FORGED_TAIL}` })],
    });
    const sut = main;

    await sut([], deps);

    assert.equal(stdout.text().includes(FORGED_TAIL), false);
    assert.equal(countOutputLines(stdout), 2);
  });

  it('Given a warning carrying a line feed, when main runs, then it is reported as a single line', async () => {
    const { deps, stdout } = createDeps({
      hooks: [craftHook({ trustStatus: 'trusted' })],
      warnings: [`benign${FORGED_TAIL}`],
    });
    const sut = main;

    await sut([], deps);

    assert.equal(stdout.text().includes(FORGED_TAIL), false);
    assert.equal(countOutputLines(stdout), 3);
  });

  it('Given a matched hook whose key carries a line feed, when main runs and writes, then the trusted announcement stays on one line', async () => {
    const { deps, stdout } = createDeps({
      hooks: [craftHook({ trustStatus: 'untrusted', key: `${HOOK_KEY}${FORGED_TAIL}` })],
    });
    const sut = main;

    await sut([], deps);

    assert.equal(stdout.text().includes(FORGED_TAIL), false);
    assert.equal(countOutputLines(stdout), 2);
  });

  it('Given a runAppServer whose rejection message carries a line feed, when main runs, then stderr stays on one line', async () => {
    const { deps, writeCalls, stderr } = createDeps({
      runAppServer: async () => {
        throw new Error(`app-server failed${FORGED_TAIL}`);
      },
    });
    const sut = main;

    const result = await sut([], deps);

    assertRefused({ result, writeCalls, stderr });
  });
});

describe('main() — the app-server call carries the injected environment', () => {
  it('Given an injected env, when main runs, then that same env is handed to runAppServer rather than left to the ambient process', async () => {
    const { deps, runAppServerCalls } = createDeps();
    const sut = main;

    await sut([], deps);

    assert.equal(runAppServerCalls.length, 1);
    assert.equal(runAppServerCalls[0].env, DEFAULT_ENV);
  });
});

describe('main() — --check mode', () => {
  const cases = [
    ['trusted', EXIT_OK],
    ['managed', EXIT_OK],
    ['untrusted', EXIT_UNTRUSTED],
    ['modified', EXIT_UNTRUSTED],
  ];

  for (const [trustStatus, expectedExit] of cases) {
    it(`Given a ${trustStatus} hook, when main runs with --check, then it returns ${expectedExit} and never calls writeConfig`, async () => {
      const { deps, writeCalls } = createDeps({ hooks: [craftHook({ trustStatus })] });
      const sut = main;

      const result = await sut(['--check'], deps);

      assert.equal(result, expectedExit);
      assert.equal(writeCalls.length, 0);
    });
  }

  it('Given a disabled matched hook, when main runs with --check, then it refuses and never calls writeConfig', async () => {
    const { deps, writeCalls, stderr } = createDeps({ hooks: [craftHook({ enabled: false })] });
    const sut = main;

    const result = await sut(['--check'], deps);

    assertRefused({ result, writeCalls, stderr });
  });
});

describe('main() — negative pin: no bypass emitted anywhere', () => {
  it('Given every path exercised above, when their stdout, stderr and writeConfig text are combined, then neither the bypass flag nor the bypass key appears', async () => {
    const scenarios = [
      { argv: [], hooks: [craftHook({ trustStatus: 'untrusted' })] },
      { argv: [], hooks: [craftHook({ trustStatus: 'trusted' })] },
      { argv: ['--check'], hooks: [craftHook({ trustStatus: 'modified' })] },
      { argv: [], hooks: [craftHook({ enabled: false })] },
      { argv: [], hooks: [], errors: [{ message: 'boom', path: '/x' }] },
      { argv: ['--not-a-flag'], hooks: [craftHook()] },
    ];
    const collected = [];

    for (const scenario of scenarios) {
      const { deps, writeCalls, stdout, stderr } = createDeps(scenario);
      await main(scenario.argv, deps);
      collected.push(stdout.text(), stderr.text(), ...writeCalls.map((call) => call.text));
    }

    const sut = collected.join('\n');

    assert.ok(!sut.includes(FORBIDDEN_FLAG));
    assert.ok(!sut.includes(FORBIDDEN_KEY));
  });
});

describe('main() — negative pin: source scan over the five authored files', () => {
  it('Given the five files this change authors, when read as text, then neither the bypass flag nor the bypass key appears in any of them', () => {
    const paths = [
      join(ADAPTER_DIR, 'src', 'hook-trust.js'),
      join(ADAPTER_DIR, 'src', 'config-toml-trust.js'),
      join(ADAPTER_DIR, 'src', 'app-server-client.js'),
      join(ADAPTER_DIR, 'src', 'trust-hook-main.js'),
      join(ADAPTER_DIR, 'bin', 'trust-hook.js'),
    ];

    for (const path of paths) {
      const sut = readFileSync(path, 'utf8');

      assert.ok(!sut.includes(FORBIDDEN_FLAG), `${path} carries the bypass flag`);
      assert.ok(!sut.includes(FORBIDDEN_KEY), `${path} carries the bypass key`);
    }
  });
});
