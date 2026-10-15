/**
 * PreToolUse ENFORCING guard hook for the Codex binding.
 *
 * Live-proven: a `command`-type PreToolUse hook that exits with code 2 and
 * writes the reason to stderr blocks the tool call — the command never runs,
 * and Codex feeds the reason back to the model as a `function_call_output`.
 * Every path here — a real denial, a fail-closed verdict, or an unreadable
 * payload — must end in the same deny call, so there is no unconditional
 * exit-0 cleanup block wrapping the try/catch: that is the one construct that
 * could let a pass preempt a deny.
 *
 * Never writes to stdout on the allow path: the JSON `hookSpecificOutput`
 * response form is a confirmed schema but a deferred, unproven path — the
 * exit-2 route is the one this binding relies on — and stray stdout could be
 * parsed as an unintended permission response.
 *
 * The file has no static import on purpose: ESM links static imports before
 * the body runs, so a dependency that fails to resolve, parse or evaluate
 * would exit 1 before any handler exists, and codex 0.161.0 runs the tool
 * call on every exit status except 2. The handlers are registered first and
 * the dependencies imported inside the try, so a load failure, a throw from an
 * event callback, an unhandled rejection, and an event loop that drains with
 * no verdict all reach the same deny call. What no code here can catch still
 * fails open: node unable to run this file (missing or unparseable), `node`
 * missing from PATH, a signal killing the process, a throwing preload in an
 * inherited NODE_OPTIONS.
 */

const DENY_EXIT_CODE = 2;
const ALLOW_EXIT_CODE = 0;

// A denial with a blank reason would be indistinguishable from a crash in
// the Codex log, so the fail-closed path always writes a fixed, non-empty
// denial line instead of an empty one.
const FAIL_CLOSED_REASON = 'denied (fail-closed)';

function denyWith(reason) {
  process.stderr.write(`craft-guard: ${reason}\n`);
  process.exit(DENY_EXIT_CODE);
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

async function main() {
  try {
    // Awaited inside main, neither a static import (linked before the handlers
    // exist) nor a top-level await (an unsettled one exits 13), so every load
    // failure reaches the catch below with its own message.
    const { resolveCraftRoot } = await import('../src/craft-root.js');
    const { decideGuard } = await import('../src/git-guard-adapter.js');
    process.env.CRAFT_ROOT = resolveCraftRoot(import.meta.url);
    const raw = await readStdin();
    const payload = JSON.parse(raw);
    const verdict = decideGuard(payload);

    if (verdict.block) {
      denyWith(verdict.reason ?? FAIL_CLOSED_REASON);
      return;
    }
    allow();
  } catch (err) {
    // Any throw anywhere — a failed load, unparseable JSON, a crashed
    // resolveCraftRoot, an unexpected payload shape — must deny, never fall
    // through to an implicit success. A guard that cannot decide must fail CLOSED.
    denyOnCrash(err);
  }
}

main();
