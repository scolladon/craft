import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServerRunner } from '../src/app-server-client.js';

const CWD = '/repo';
const RESPONSE_ID = 2;

function responseLine(id) {
  return `${JSON.stringify({ jsonrpc: '2.0', id, result: { ok: true } })}\n`;
}

// A hand-rolled emitter, not node's EventEmitter: the runner's own `on`
// registrations are the only consumer, and a bespoke fake keeps full control
// over when a handler fires without inheriting EventEmitter's unrelated
// behaviour (e.g. throwing on an unhandled "error" event).
function createFakeStream() {
  const handlers = new Map();
  return {
    setEncoding() {
      // the fake always hands the runner already-decoded strings
    },
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    emit(event, ...args) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
  };
}

function createFakeChildProcess() {
  const state = { writes: [], stdinEnded: false, killCount: 0 };
  const events = createFakeStream();
  const child = {
    on: events.on,
    emit: events.emit,
    kill() {
      state.killCount += 1;
    },
    stdin: {
      write(chunk) {
        state.writes.push(chunk);
      },
      end() {
        state.stdinEnded = true;
      },
    },
    stdout: createFakeStream(),
    stderr: createFakeStream(),
  };
  return { child, state };
}

function createFakeSpawn(child) {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return child;
  };
  return { spawn, calls };
}

describe('createAppServerRunner() — normal response', () => {
  it('Given a scripted stream whose id-2 response arrives normally, when the runner runs, then it resolves with the accumulated stdout, writes both request lines to stdin, ends stdin, and kills the child exactly once', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn, calls } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });
    const requests = ['{"id":1}\n', '{"id":2}\n'];
    const responseText = responseLine(RESPONSE_ID);

    const runPromise = sut({ requests, cwd: CWD, responseId: RESPONSE_ID });
    child.stdout.emit('data', responseText);
    const result = await runPromise;

    assert.equal(result, responseText);
    assert.deepEqual(calls, [{ command: 'codex', args: ['app-server'], options: { cwd: CWD } }]);
    assert.deepEqual(state.writes, requests);
    assert.equal(state.stdinEnded, true);
    assert.equal(state.killCount, 1);
  });
});

describe('createAppServerRunner() — chunked stdout', () => {
  it('Given stdout that arrives split mid-line across two chunks, when the runner runs, then it still resolves on the reassembled response line', async () => {
    const { child } = createFakeChildProcess();
    const { spawn } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });
    const line = responseLine(RESPONSE_ID);
    const splitPoint = Math.floor(line.length / 2);

    const runPromise = sut({ requests: [], cwd: CWD, responseId: RESPONSE_ID });
    child.stdout.emit('data', line.slice(0, splitPoint));
    child.stdout.emit('data', line.slice(splitPoint));
    const result = await runPromise;

    assert.equal(result, line);
  });
});

describe('createAppServerRunner() — timeout', () => {
  it('Given a stream where no response ever arrives, when the timeout elapses, then the runner rejects with an error naming the timeout, and the child is killed exactly once', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });

    await assert.rejects(
      sut({ requests: [], cwd: CWD, responseId: RESPONSE_ID, timeoutMs: 5 }),
      /timed out/i
    );
    assert.equal(state.killCount, 1);
  });
});

describe('createAppServerRunner() — early non-zero exit', () => {
  it('Given a child that exits non-zero before responding, when the runner runs, then it rejects naming the exit code and the collected stderr', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });

    const runPromise = sut({ requests: [], cwd: CWD, responseId: RESPONSE_ID });
    child.stderr.emit('data', 'boom: config not found');
    child.emit('exit', 17);

    await assert.rejects(runPromise, (error) => {
      assert.match(error.message, /17/);
      assert.match(error.message, /boom: config not found/);
      return true;
    });
    assert.equal(state.killCount, 1);
  });
});

describe('createAppServerRunner() — spawn error', () => {
  it('Given a spawn that emits an error event, when the runner runs, then it rejects naming the error', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });

    const runPromise = sut({ requests: [], cwd: CWD, responseId: RESPONSE_ID });
    child.emit('error', new Error('spawn codex ENOENT'));

    await assert.rejects(runPromise, /ENOENT/);
    assert.equal(state.killCount, 1);
  });
});

describe('createAppServerRunner() — unparsable line', () => {
  it('Given a complete line that is not valid JSON, when the runner runs, then it resolves with the accumulated text, and the child is killed exactly once', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });
    const garbledLine = 'not-json\n';

    const runPromise = sut({ requests: [], cwd: CWD, responseId: RESPONSE_ID });
    child.stdout.emit('data', garbledLine);
    const result = await runPromise;

    assert.equal(result, garbledLine);
    assert.equal(state.killCount, 1);
  });
});

describe('createAppServerRunner() — double-settle pin', () => {
  it('Given a stream that emits the response and then more data, when the runner runs, then the promise settles once and kill() was called once', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });
    const line = responseLine(RESPONSE_ID);

    const runPromise = sut({ requests: [], cwd: CWD, responseId: RESPONSE_ID });
    child.stdout.emit('data', line);
    child.stdout.emit('data', responseLine(3));
    const result = await runPromise;

    assert.equal(result, line);
    assert.equal(state.killCount, 1);
  });
});
