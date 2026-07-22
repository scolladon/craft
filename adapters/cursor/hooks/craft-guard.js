/**
 * beforeShellExecution ENFORCING guard hook for the Cursor binding.
 *
 * Live-proven (cursor-agent 2026.07.20): a `.cursor/hooks.json` beforeShellExecution
 * hook whose stdout is `{"permission":"deny",...}` BLOCKS the shell call before it
 * runs — the command never executes, the agent sees `user_message` and reports the
 * denial, and `--force`/`--yolo` does NOT override it. The deny wire is stdout JSON,
 * NOT an exit code (the exact wire the codex binding could not assume — codex denies
 * with exit-2; Cursor denies with a stdout permission object). A future reader must not
 * "port" the exit-2 form here: Cursor reads stdout, and a stray exit code is ignored.
 *
 * Two fail-closed layers, by design:
 *   1. Any throw in the decision path (unreadable stdin, bad JSON, a malformed
 *      payload, a throwing predicate) DENIES here — never falls through to allow.
 *   2. hooks.json registers this hook with `failClosed: true`, so a process-level
 *      crash BEFORE this handler writes anything is also blocked by Cursor. Measured:
 *      without failClosed, a crashing hook fails OPEN (the command runs).
 *
 * The response is written SYNCHRONOUSLY to fd 1 (`writeSync(1, …)`) then main()
 * returns — no async `process.stdout.write` + `process.exit`, which can truncate the
 * deny bytes before the pipe flushes (the Antigravity flush-before-exit lesson). The
 * stdin read is a synchronous fd-0 read for the same reason async data/end is flaky.
 */
import { readFileSync, writeSync } from 'node:fs';
import { decideGuard } from '../src/cursor-guard-adapter.js';

// A denial with a blank reason would be indistinguishable from a crash in the
// Cursor log, so the fail-closed path always carries a fixed, non-empty reason.
const FAIL_CLOSED_REASON = 'denied (fail-closed)';

function respond(response) {
  writeSync(1, JSON.stringify(response));
}

function deny(reason) {
  respond({
    permission: 'deny',
    user_message: `craft-guard: ${reason}`,
    agent_message: `Blocked by the craft guard: ${reason}`,
  });
}

function allow() {
  respond({ permission: 'allow' });
}

function main() {
  try {
    const raw = readFileSync(0, 'utf8');
    const verdict = decideGuard(JSON.parse(raw));
    if (verdict.block) {
      deny(verdict.reason ?? FAIL_CLOSED_REASON);
      return;
    }
    allow();
  } catch (err) {
    deny(err?.message || FAIL_CLOSED_REASON);
  }
}

main();
