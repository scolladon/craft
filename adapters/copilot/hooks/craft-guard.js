/**
 * preToolUse ENFORCING guard hook for the Copilot binding.
 *
 * Live-proven on copilot 1.0.92: a hook that writes
 * `{"permissionDecision":"deny","permissionDecisionReason":"<text>"}` to stdout
 * and exits 0 denies the call and the model sees the reason; exit 2 also
 * denies (the model sees only the exit code), and so does a crash. Exit 0 with
 * an empty stdout allows. A block therefore answers on stdout and exits 0 from
 * the write callback (an earlier exit could truncate the pipe); every crash
 * path exits 2 with the reason on stderr.
 *
 * A hook that outlives its `timeoutSec` (~30 s) fails OPEN — copilot's
 * behaviour. This file therefore never lets a verdict run that long: the
 * verdict is computed in a worker thread (a synchronous parse blocks its own
 * event loop, so only another thread can enforce a deadline) and a main-thread
 * timer denies fail-closed when none arrives in time. Beyond this file's reach:
 * node unable to run it (missing or unparseable), `node` missing from PATH, a
 * signal killing the process, a throwing preload in an inherited NODE_OPTIONS.
 *
 * The file has no static import on purpose: ESM links static imports before
 * the body runs, so a dependency that fails to resolve, parse or evaluate
 * would exit 1 before any handler exists. The handlers are registered first
 * and the dependencies imported inside the try, so a load failure, a throw
 * from an event callback, an unhandled rejection, and an event loop that
 * drains with no verdict all reach the same deny call.
 */

const DENY_EXIT_CODE = 2;
// Exit 0 carries both verdicts: an allow, and a deny whose JSON body names the
// reason. Only a crash exits 2.
const VERDICT_EXIT_CODE = 0;

// A fail-closed verdict carries no reason; an empty denial would be
// indistinguishable from a crash in the copilot log.
const FAIL_CLOSED_REASON = 'denied (fail-closed)';

// Well under copilot's ~30 s hook timeout, far above the ~70 ms cold verdict.
const VERDICT_DEADLINE_MS = 5000;
const DEADLINE_REASON = 'craft: guard verdict timed out — denied fail-closed';
const WORKER_URL = new URL('./craft-guard-worker.js', import.meta.url);

// Read once; may only shorten the deadline, so tests stay fast and production
// cannot be configured into failing open.
function resolveDeadlineMs(override) {
  const requested = Number(override);
  if (!Number.isFinite(requested) || requested <= 0) {
    return VERDICT_DEADLINE_MS;
  }
  return Math.min(requested, VERDICT_DEADLINE_MS);
}

const DEADLINE_MS = resolveDeadlineMs(process.env.CRAFT_GUARD_DEADLINE_MS);

// Timer and worker race; the first to settle wins, the loser is ignored.
class VerdictRace {
  #settled = false;

  settle(conclude) {
    if (this.#settled) {
      return;
    }
    this.#settled = true;
    conclude();
  }
}

function awaitVerdict(Worker, payload) {
  const race = new VerdictRace();
  const worker = new Worker(WORKER_URL, { workerData: payload });
  const timer = setTimeout(() => {
    race.settle(() => {
      worker.terminate();
      deny({ reason: DEADLINE_REASON });
    });
  }, DEADLINE_MS);
  worker.once('message', (outcome) => race.settle(() => conclude(timer, outcome)));
  // No verdict, by error or exit, is a crash: same exit-2 path as every other.
  worker.once('error', (err) => race.settle(() => denyOnCrash(err)));
  worker.once('exit', () => race.settle(denyWithoutVerdict));
}

function conclude(timer, { verdict, audit }) {
  clearTimeout(timer);
  process.stderr.write(`craft-guard: ${JSON.stringify(audit)}\n`);
  if (verdict.block) {
    deny(verdict);
    return;
  }
  allow();
}

function denyWith(reason) {
  process.stderr.write(`craft-guard: ${reason}\n`);
  process.exit(DENY_EXIT_CODE);
}

// Function declarations hoist, so main may precede the helpers it calls; the
// handlers registered at the bottom still run before main() starts.
async function main() {
  try {
    // Awaited inside main, neither a static import (linked before the handlers
    // exist) nor a top-level await (an unsettled one exits 13), so every load
    // failure reaches the catch below with its own message.
    const { resolveCraftRoot } = await import('../src/craft-root.js');
    const { Worker } = await import('node:worker_threads');
    process.env.CRAFT_ROOT = resolveCraftRoot(import.meta.url);
    const raw = await readStdin();
    const payload = JSON.parse(raw);
    awaitVerdict(Worker, payload);
  } catch (err) {
    // A guard that cannot decide must fail CLOSED, never fall through to an
    // implicit success.
    denyOnCrash(err);
  }
}

// Thrown values are arbitrary: a non-string message (a Symbol) or a throwing
// message getter would throw inside the crash handler, and node then exits 7
// instead of 2. Reading the message must never throw.
function readMessage(err) {
  try {
    return err?.message;
  } catch {
    return undefined;
  }
}

function reasonOf(err) {
  const message = readMessage(err);
  return typeof message === 'string' && message !== '' ? message : FAIL_CLOSED_REASON;
}

function denyOnCrash(err) {
  denyWith(reasonOf(err));
}

function denyWithoutVerdict() {
  denyWith(FAIL_CLOSED_REASON);
}

process.on('uncaughtException', denyOnCrash);
process.on('unhandledRejection', denyOnCrash);
// An explicit process.exit does not emit beforeExit, so this fires only when
// the loop drains with no verdict ever reached.
process.on('beforeExit', denyWithoutVerdict);

function readStdin() {
  return new Promise((resolvePromise) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
    });
    process.stdin.on('end', () => resolvePromise(raw));
  });
}

function allow() {
  process.exit(VERDICT_EXIT_CODE);
}

function onDenyWritten(err) {
  if (err) {
    denyOnCrash(err);
    return;
  }
  process.exit(VERDICT_EXIT_CODE);
}

function deny(verdict) {
  const denial = {
    permissionDecision: 'deny',
    permissionDecisionReason: verdict.reason ?? FAIL_CLOSED_REASON,
  };
  process.stdout.write(`${JSON.stringify(denial)}\n`, onDenyWritten);
}

main();
