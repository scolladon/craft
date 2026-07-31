import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServerRunner } from '../src/app-server-client.js';

const CWD = '/repo';
const RESPONSE_ID = 2;
const ENV = { CODEX_HOME: '/fixture/codex-home' };

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

// Models the two child behaviours a naive double gets wrong, both of which
// already cost a live failure once:
//   - the real server treats stdin EOF as a shutdown signal, so end() here
//     makes the child leave with status 0 exactly as the real one does. A
//     double whose end() merely set a flag would let a premature close look
//     harmless to every assertion below.
//   - a killed child really does report an exit, with a null code and the
//     signal that felled it — so kill() emits one too, which pins that an exit
//     arriving after the promise settled cannot settle it a second time.
function createFakeChildProcess() {
  const state = { writes: [], stdinEnded: false, killCount: 0, writesAfterEnd: 0 };
  const events = createFakeStream();
  const stdinEvents = createFakeStream();
  const child = {
    on: events.on,
    emit: events.emit,
    kill() {
      state.killCount += 1;
      events.emit('exit', null, 'SIGTERM');
    },
    stdin: {
      on: stdinEvents.on,
      emit: stdinEvents.emit,
      write(chunk) {
        if (state.stdinEnded) {
          state.writesAfterEnd += 1;
          return;
        }
        state.writes.push(chunk);
      },
      end() {
        state.stdinEnded = true;
        events.emit('exit', 0);
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
  it('Given a scripted stream whose id-2 response arrives normally, when the runner runs, then it resolves with the accumulated stdout, writes both request lines to stdin, and kills the child exactly once', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn, calls } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });
    const requests = ['{"id":1}\n', '{"id":2}\n'];
    const responseText = responseLine(RESPONSE_ID);

    const runPromise = sut({ requests, cwd: CWD, env: ENV, responseId: RESPONSE_ID });
    child.stdout.emit('data', responseText);
    const result = await runPromise;

    assert.equal(result, responseText);
    assert.deepEqual(calls, [{ command: 'codex', args: ['app-server'], options: { cwd: CWD, env: ENV } }]);
    assert.deepEqual(state.writes, requests);
    assert.equal(state.killCount, 1);
  });

  it('Given an injected env, when the runner spawns the child, then that env is handed to spawn rather than left to the ambient process', async () => {
    const { child } = createFakeChildProcess();
    const { spawn, calls } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });

    const runPromise = sut({ requests: [], cwd: CWD, env: ENV, responseId: RESPONSE_ID });
    child.stdout.emit('data', responseLine(RESPONSE_ID));
    await runPromise;

    assert.equal(calls[0].options.env, ENV);
  });

  it('Given the awaited response has not arrived yet, when the runner has written its requests, then stdin is still open so the server is not shut down before it answers', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });
    const requests = ['{"id":1}\n', '{"id":2}\n'];

    const runPromise = sut({ requests, cwd: CWD, responseId: RESPONSE_ID });

    assert.equal(state.stdinEnded, false);
    assert.equal(state.writesAfterEnd, 0);
    assert.deepEqual(state.writes, requests);

    child.stdout.emit('data', responseLine(RESPONSE_ID));
    await runPromise;
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
      sut({ requests: [], cwd: CWD, env: ENV, responseId: RESPONSE_ID, timeoutMs: 5 }),
      (error) => {
        assert.match(error.message, /timed out/i);
        // The kill this timeout performs makes the child report its own exit;
        // the diagnostic the caller sees must stay the timeout, not that exit.
        assert.doesNotMatch(error.message, /exited/i);
        return true;
      }
    );
    assert.equal(state.killCount, 1);
  });
});

describe('createAppServerRunner() — stdin is the shutdown signal', () => {
  it('Given a run whose stdin is closed before the answer arrives, when the child reacts as the real server does, then the run fails instead of quietly waiting', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });

    const runPromise = sut({ requests: [], cwd: CWD, env: ENV, responseId: RESPONSE_ID });
    child.stdin.end();

    await assert.rejects(runPromise, /exited/i);
    assert.equal(state.stdinEnded, true);
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

describe('createAppServerRunner() — clean early exit', () => {
  // What an unauthenticated CODEX_HOME actually does: the server answers
  // initialize, then leaves with status 0 and nothing on stderr. Both fields
  // the diagnostic used to quote are empty here, so the accumulated stdout is
  // the only evidence of how far the exchange got.
  it('Given a child that answers initialize then exits 0 with empty stderr, when the runner runs, then it rejects quoting the stdout it did receive', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });
    const initializeLine = responseLine(1);

    const runPromise = sut({ requests: [], cwd: CWD, env: ENV, responseId: RESPONSE_ID });
    child.stdout.emit('data', initializeLine);
    child.emit('exit', 0);

    await assert.rejects(runPromise, (error) => {
      assert.match(error.message, /exited/i);
      assert.ok(error.message.includes(initializeLine.trim()));
      return true;
    });
    assert.equal(state.killCount, 1);
  });
});

describe('createAppServerRunner() — stdin error', () => {
  // Without a listener here the stream error escapes both this promise and the
  // caller's catch, and node exits 1 — the very code --check reserves for "the
  // hook is untrusted", so a plumbing failure would read as a trust verdict.
  it('Given a stdin that emits an error event, when the runner runs, then it rejects naming the error and kills the child once', async () => {
    const { child, state } = createFakeChildProcess();
    const { spawn } = createFakeSpawn(child);
    const sut = createAppServerRunner({ spawn });

    const runPromise = sut({ requests: [], cwd: CWD, env: ENV, responseId: RESPONSE_ID });
    child.stdin.emit('error', new Error('write EPIPE'));

    await assert.rejects(runPromise, /EPIPE/);
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
