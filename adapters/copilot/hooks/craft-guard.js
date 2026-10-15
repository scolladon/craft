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
 * A hook that outlives its `timeoutSec` fails OPEN — that is copilot's
 * behaviour and no code here can change it. Also beyond this file's reach:
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
const ALLOW_EXIT_CODE = 0;

// A fail-closed verdict carries no reason; an empty denial would be
// indistinguishable from a crash in the copilot log.
const FAIL_CLOSED_REASON = 'denied (fail-closed)';

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
    const { buildAuditEntry, decideGuard } = await import('../src/git-guard-adapter.js');
    process.env.CRAFT_ROOT = resolveCraftRoot(import.meta.url);
    const raw = await readStdin();
    const payload = JSON.parse(raw);
    const verdict = decideGuard(payload);
    process.stderr.write(`craft-guard: ${JSON.stringify(buildAuditEntry(payload, verdict))}\n`);

    if (verdict.block) {
      deny(verdict);
      return;
    }
    allow();
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
  process.exit(ALLOW_EXIT_CODE);
}

function onDenyWritten(err) {
  if (err) {
    denyOnCrash(err);
    return;
  }
  process.exit(ALLOW_EXIT_CODE);
}

function deny(verdict) {
  const denial = {
    permissionDecision: 'deny',
    permissionDecisionReason: verdict.reason ?? FAIL_CLOSED_REASON,
  };
  process.stdout.write(`${JSON.stringify(denial)}\n`, onDenyWritten);
}

main();
