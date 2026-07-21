/**
 * PreToolUse ENFORCING guard hook for the Codex binding.
 *
 * Live-proven: a `command`-type PreToolUse hook that exits with code 2 and
 * writes the reason to stderr blocks the tool call — the command never runs,
 * and Codex feeds the reason back to the model as a `function_call_output`.
 * This is the exact inverse of the Copilot observer
 * (adapters/copilot/hooks/craft-observer.js), whose always-exit-0 is
 * deliberate because Copilot's hook cannot deny. A future reader must not
 * "fix" the exit code in either direction: Copilot exits 0 because it
 * genuinely can't enforce; Codex exits 2 because it genuinely can, and every
 * path here — a real denial, a fail-closed verdict, or an unreadable
 * payload — must end in the same deny call. Unlike the Copilot observer,
 * there is no unconditional exit-0 cleanup block wrapping the try/catch
 * here — that is the one construct that could let a pass preempt a deny.
 *
 * Never writes to stdout on the allow path: the JSON `hookSpecificOutput`
 * response form is a confirmed schema but a deferred, unproven path — the
 * exit-2 route is the one this binding relies on — and stray stdout could be
 * parsed as an unintended permission response.
 */
import { resolveCraftRoot } from '../src/craft-root.js';
import { decideGuard } from '../src/git-guard-adapter.js';

// A denial with a blank reason would be indistinguishable from a crash in
// the Codex log, so the fail-closed path always writes a fixed, non-empty
// denial line instead of an empty one.
const FAIL_CLOSED_REASON = 'denied (fail-closed)';

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

function denyWith(reason) {
  process.stderr.write(`craft-guard: ${reason}\n`);
  process.exit(2);
}

function allow() {
  process.exit(0);
}

async function main() {
  try {
    // Resolved inside the try, not at module top level: resolveCraftRoot has
    // three throw paths, and a top-level throw would crash the process
    // before any verdict — deny or allow — is ever produced.
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
    // Any throw anywhere — unparseable JSON, a crashed resolveCraftRoot, an
    // unexpected payload shape — must deny, never fall through to an
    // implicit success. A guard that cannot decide must fail CLOSED.
    denyWith(err?.message || FAIL_CLOSED_REASON);
  }
}

main();
