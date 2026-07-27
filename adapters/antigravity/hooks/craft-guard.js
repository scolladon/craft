/**
 * PreToolUse ENFORCING guard hook for the Antigravity binding.
 *
 * Antigravity's deny mechanism differs from Codex's exit-code-2: a
 * `type: command` PreToolUse hook hard-blocks a tool call by writing a JSON
 * decision `{ "decision": "deny", "reason": "…" }` to STDOUT (pinned from the
 * shipped language_server hook-contract docs: decision ∈ allow | ask | deny,
 * where "deny" hard-blocks the execution immediately). The verdict travels on
 * stdout, not the exit code — exit 0 always.
 *
 * The benign path writes NOTHING to stdout (no decision = the normal permission
 * flow proceeds). It deliberately does NOT emit `decision: "allow"`: that value
 * AUTO-approves the tool, which would bypass the user's own permission prompts —
 * a guard that only blocks the targeted-bad commands must stay silent otherwise.
 *
 * Every failure path — a real denial, a fail-closed verdict, an unreadable
 * payload — ends in the same deny emission. A guard that cannot decide fails
 * CLOSED, and the reason string keeps that decision visible (also mirrored to
 * stderr, which the language_server logs).
 *
 * NOT live-verified: the exact stdout-decision wire (vs an exit code) and the
 * empty-output benign semantics are pinned from the shipped docs, not from a
 * triggered hook (Antigravity exposes no headless port to fire one). See
 * docs/contributing/specs/antigravity-poc-record.md.
 */
import { decideGuard } from '../src/antigravity-guard-adapter.js';

const FAIL_CLOSED_REASON = 'denied (fail-closed)';

function readStdin() {
  return new Promise((resolvePromise, rejectPromise) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
    });
    process.stdin.on('end', () => resolvePromise(raw));
    // A stdin stream error must fail CLOSED (a deny), never leave the promise
    // unsettled and the guard hung: reject so main's catch reaches denyWith.
    process.stdin.on('error', (err) => rejectPromise(err instanceof Error ? err : new Error('stdin read error')));
  });
}

function denyWith(reason) {
  const line = reason || FAIL_CLOSED_REASON;
  // The deny bytes on stdout ARE the enforcement signal here (the exit code is
  // always 0, unlike codex's exit-2). process.exit() can drop an unflushed async
  // pipe write, so exit only AFTER stdout drains via the write callback — a
  // truncated decision would silently fail OPEN, the one outcome this guard
  // exists to prevent. stderr is a best-effort log, not the enforcement.
  process.stderr.write(`craft-guard: ${line}\n`);
  process.stdout.write(JSON.stringify({ decision: 'deny', reason: line }), () => process.exit(0));
}

function allow() {
  // Emit nothing: no decision = normal permission flow. See the header note on
  // why `decision: "allow"` is deliberately NOT emitted.
  process.exit(0);
}

async function main() {
  try {
    const raw = await readStdin();
    const payload = JSON.parse(raw);
    const verdict = decideGuard(payload);

    if (verdict.block) {
      denyWith(verdict.reason ?? FAIL_CLOSED_REASON);
      return;
    }
    allow();
  } catch (err) {
    // Any throw anywhere — unparseable JSON, an unexpected payload shape — must
    // deny, never fall through to an implicit allow. Fail CLOSED.
    denyWith(err?.message || FAIL_CLOSED_REASON);
  }
}

main();
