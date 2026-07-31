/**
 * Injectable transport for codex `app-server`: spawns the child, writes the
 * scripted JSON-RPC request lines, and resolves with the accumulated stdout
 * once the awaited response id's line arrives — or rejects, bounded by a
 * timeout, so a server that never responds cannot hang the caller.
 *
 * `spawn` is injected rather than imported so every branch (timeout, child
 * error, early exit, a malformed line) is exercisable with a fake; the real
 * `node:child_process` import lives only in the binary that constructs this
 * runner.
 */

const APP_SERVER_COMMAND = 'codex';
const APP_SERVER_ARGS = ['app-server'];
const DEFAULT_TIMEOUT_MS = 10_000;

function splitCompleteLines(buffer) {
  const lines = buffer.split('\n');
  const remainder = lines.pop();
  return { lines, remainder };
}

// Buffers raw stdout chunks against a JSON-RPC line splitting across two
// `data` events — only a complete line may ever be inspected for the
// response terminator.
function createLineAccumulator() {
  let lineBuffer = '';
  let text = '';
  return {
    append(chunk) {
      text += chunk;
      lineBuffer += chunk;
      const { lines, remainder } = splitCompleteLines(lineBuffer);
      lineBuffer = remainder;
      return lines;
    },
    get text() {
      return text;
    },
  };
}

// A line ends the read either because it is the awaited response or because
// it fails to parse at all — the latter resolves (not rejects) so the
// caller's own strict parser produces the diagnostic, in one place.
function isTerminalLine(line, responseId) {
  try {
    return JSON.parse(line)?.id === responseId;
  } catch {
    return true;
  }
}

// stdin stays OPEN for the life of the request. The server treats stdin EOF
// as a shutdown signal: closing it after writing makes the server exit having
// answered only the first request, so the awaited response never arrives and
// the run fails with an exit-before-responding error. What bounds this call is
// the timeout and the kill below, never an EOF — so nothing here may close stdin.
function writeRequests(child, requests) {
  for (const line of requests) {
    child.stdin.write(line);
  }
}

/**
 * @param {{ spawn: Function }} deps
 * @returns {(params: { requests: string[], cwd: string, timeoutMs?: number, responseId: number }) => Promise<string>}
 */
export function createAppServerRunner({ spawn }) {
  return function runAppServer({ requests, cwd, timeoutMs = DEFAULT_TIMEOUT_MS, responseId }) {
    return new Promise((resolve, reject) => {
      const child = spawn(APP_SERVER_COMMAND, APP_SERVER_ARGS, { cwd });
      const accumulator = createLineAccumulator();
      let stderrText = '';
      let settled = false;

      // Every settle path — success, timeout, process error, early exit —
      // routes through this guard so the child is killed exactly once and
      // the promise never settles twice.
      const finish = (settleAction) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        settleAction();
      };

      const timer = setTimeout(() => {
        finish(() =>
          reject(new Error(`app-server timed out after ${timeoutMs}ms waiting for response id ${responseId}`))
        );
      }, timeoutMs);

      child.on('error', (error) => {
        finish(() => reject(new Error(`app-server process error: ${error.message}`)));
      });

      child.on('exit', (code) => {
        finish(() => reject(new Error(`app-server exited with code ${code} before responding: ${stderrText}`)));
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderrText += chunk;
      });

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        const lines = accumulator.append(chunk);
        const isComplete = lines.some((line) => line.trim().length > 0 && isTerminalLine(line, responseId));
        if (isComplete) {
          finish(() => resolve(accumulator.text));
        }
      });

      writeRequests(child, requests);
    });
  };
}
