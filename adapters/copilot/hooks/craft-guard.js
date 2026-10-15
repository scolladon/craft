/**
 * preToolUse observer for the Copilot binding — audit-only, NEVER enforcement.
 *
 * A live probe proved Copilot's preToolUse hook fires but cannot deny: neither a
 * `{"permission":"deny"}` payload on stdout nor `exit 2` blocked the call —
 * `git push --force origin main` executed unimpeded either way. This script
 * therefore only RECORDS the guard verdict (to stderr, never stdout, so it can
 * never be mistaken for a permission response) and always exits 0. A future
 * reader must not "fix" the exit code into a fake enforcement — the enforcing
 * layers are the native `--deny-tool` pattern set and path containment launch
 * flags (src/deny-tool-args.js), not this hook.
 */
import { buildAuditEntry, decideGuard } from '../src/git-guard-adapter.js';
import { resolveCraftRoot } from '../src/craft-root.js';

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

async function main() {
  try {
    // Resolved inside the try, not at module top level: resolveCraftRoot
    // throws on three conditions (see craft-root.js), and a top-level throw
    // would crash the process before any audit line is ever written — the
    // one artifact this layer exists to produce, lost for every tool call.
    process.env.CRAFT_ROOT = resolveCraftRoot(import.meta.url);
    const raw = await readStdin();
    const payload = JSON.parse(raw);
    const verdict = decideGuard(payload);
    process.stderr.write(`craft-observer: ${JSON.stringify(buildAuditEntry(payload, verdict))}\n`);
  } catch (err) {
    process.stderr.write(`craft-observer: audit failed — ${err.message}\n`);
  } finally {
    process.exit(0);
  }
}

main();
